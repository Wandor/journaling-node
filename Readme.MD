# Journaling Node

A Node.js application for journaling with features like JWT authentication, OpenAI integration, sentiment analysis, and PostgreSQL as the database.

## Setup Instructions

### Prerequisites

Before running the application locally, make sure you have the following installed:

- [Node.js](https://nodejs.org/en/) (v18.x or higher)
- [Yarn](https://yarnpkg.com/) (for package management)
- [PostgreSQL](https://www.postgresql.org/download/) (for the database)

### 1. Clone the Repository

Clone the repository to your local machine:
https://github.com/Wandor/journaling-node.git

Checkout to branch development

### 2. Install Dependencies

Run the following command to install all dependencies:

yarn install

### 3. Set Up Environment Variables

Create a `.env` file in the root of your project and add the following environment variables:

.env file
Database URL for PostgreSQL
DATABASE_URL="postgresql://postgres:password@localhost:5432/database?schema=public"

JWT Secret Key
JWT_SECRET=''

JWT Expiration times (in seconds)
JWT_EXPIRATION=
JWT_REFRESH_EXPIRATION=

Token expiration configurations
REFRESH_TOKEN_EXPIRY_DAYS=
PASSWORD_EXPIRY_DAYS=

Account Locking & OTP configurations
ACCOUNT_LOCK_MAX_COUNT=
OTP_RESEND_MAX_COUNT=
OTP_SEND_MAX_HOURS=
OTP_EXPIRY_MINUTES=

Rate limiting configuration
MAX_NUMBER_OF_REQUESTS=

OpenAI API Key
OPENAI_API_KEY=your-openai-api-key-here

Sentiment Analysis Library - use sentiment to use sentiment package
SENTIMENT_ANALYSIS='sentiment'


Make sure to replace `your-openai-api-key-here` with your actual OpenAI API key.

### 4. Set Up PostgreSQL

Ensure you have a running instance of PostgreSQL. If you're using Docker, you can quickly set up a PostgreSQL container with the following command:

docker run --name journaling-db -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres

Create a database named `journaling` in PostgreSQL if it doesn't already exist.

psql -U postgres CREATE DATABASE journaling;

### 5. Prisma Setup

Run the following commands to migrate your database schema and generate the Prisma client:
yarn prisma:merge - to merge the different models
yarn prisma:generate - to generate the client
yarn prisma:migrate - to migrate the schema
yarn prisma:studio - to have a view of the postgres sql


### 6. Running the Application

To run the application in development mode with hot-reloading, use the following command:

yarn dev

This will start the server and listen for requests.

### 7. Running Tests

You can run tests using Jest:

yarn test or npx jest --detectOpenHandles
npx jest --coverage - to get coverage


## Environment Variables

The following environment variables are used by the application:

| Variable                    | Description                                                     |
| --------------------------- | --------------------------------------------------------------- |
| `DATABASE_URL`              | PostgreSQL connection string.                                   |
| `JWT_SECRET`                | Secret key for signing JWTs.                                    |
| `JWT_EXPIRATION`            | JWT expiration time in seconds.                                 |
| `JWT_REFRESH_EXPIRATION`    | JWT refresh token expiration time in seconds.                   |
| `REFRESH_TOKEN_EXPIRY_DAYS` | Number of days until refresh token expires.                     |
| `PASSWORD_EXPIRY_DAYS`      | Number of days until passwords expire and require reset.        |
| `ACCOUNT_LOCK_MAX_COUNT`    | Max number of failed login attempts before locking the account. |
| `OTP_RESEND_MAX_COUNT`      | Max number of OTP resend attempts allowed.                      |
| `OTP_SEND_MAX_HOURS`        | Max number of hours allowed before sending OTP again.           |
| `OTP_EXPIRY_MINUTES`        | Expiry time for OTPs in minutes.                                |
| `MAX_NUMBER_OF_REQUESTS`    | Max number of requests allowed (for rate limiting).             |
| `OPENAI_API_KEY`            | OpenAI API key for interacting with OpenAI services.            |
| `SENTIMENT_ANALYSIS`        | Sentiment analysis library used in the application.             |

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for
