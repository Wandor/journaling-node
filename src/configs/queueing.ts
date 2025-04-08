import amqp, { Connection, ConfirmChannel, Message } from 'amqplib/callback_api';
import logger from './logger';
import Workers from '../services/workers';

let amqpConn: Connection | null = null;

let pubChannel: ConfirmChannel | null = null;
const offlinePubQueue: any[] = [];

function start() {
  amqp.connect('amqp://localhost', function (err, conn) {
    if (err) {
      logger.error('[AMQP]', err.message);
      return setTimeout(start, 1000);
    }

    conn.on('error', function (error) {
      if (error.message !== 'Connection closing') {
        logger.error('[AMQP] conn error', error.message);
      }
      start();
    });

    conn.on('close', function () {
      logger.error('[AMQP] reconnecting');
      return setTimeout(start, 1000);
    });

    logger.info('[AMQP] connected');
    amqpConn = conn;

    whenConnected();
  });
}

function whenConnected() {
  startPublisher();
  startWorker();
}

function startPublisher() {
  if (!amqpConn) {
    logger.error('RabbitMQ connection is not initialized.');
    return;
  }
  amqpConn!.createConfirmChannel(function (err, ch) {
    if (closeOnErr(err)) return;

    ch.on('error', function (error) {
      logger.error('[AMQP] channel error', error);
    });

    ch.on('close', function () {
      logger.warn('[AMQP] channel closed');
    });

    pubChannel = ch;

    while (offlinePubQueue.length > 0) {
      const [exchange, routingKey, content] = offlinePubQueue.shift()!;
      publish(exchange, routingKey, content);
    }
  });
}

function publish(exchange: string, routingKey: string, content: Buffer) {
  try {
    pubChannel!.publish(
      exchange,
      routingKey,
      content,
      { persistent: true },
      function (err, ok) {
        if (err) {
          logger.error('[AMQP] publish', err, routingKey, content);
          offlinePubQueue.push([exchange, routingKey, content]);
          pubChannel!.connection.close();
        }
      },
    );
  } catch (e: unknown) {
    if (e instanceof Error) {
      logger.error('[AMQP] publisher', e.message, routingKey, content);
    } else {
      logger.error('[AMQP] publisher', 'Unknown error', routingKey, content);
    }
  }
}

// A worker that acks messages only if processed succesfully
function startWorker() {
  if (!amqpConn) {
    logger.error('RabbitMQ connection is not initialized.');
    return;
  }
  amqpConn!.createConfirmChannel(function (err, ch) {
    if (closeOnErr(err)) return;

    ch.on('error', function (error) {
      logger.error('[AMQP] channel error', error.message);
    });

    ch.on('close', function () {
      logger.warn('[AMQP] channel closed');
    });

    ch.prefetch(30);

    ch.assertQueue('entry_queue', { durable: true }, function (error, ok) {
      if (closeOnErr(error)) return;
      ch.consume('entry_queue', processJournalEntry, { noAck: false });
      logger.info('Journal entry queue worker has started');
    });

    function processJournalEntry(msg: Message | null) {
      if (msg === null) {
        logger.error('[AMQP] received null message');
        return;
      }
      Workers.journalEntryWorker(msg, function (ok: boolean) {
        try {
          if (ok) ch.ack(msg);
          else ch.reject(msg, true);
        } catch (e) {
          closeOnErr(e);
        }
      });
    }
  });
}

function closeOnErr(err: any): boolean {
  if (err) {
    logger.error('[AMQP] error', err);
    try {
      amqpConn?.close();
    } catch (e) {
      logger.error(e)
    }
    return true;
  }
  return false;
}

start();

module.exports = { start, publish };
