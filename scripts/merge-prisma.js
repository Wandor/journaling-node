const fs = require("fs");
const path = require("path");

const schemaPath = path.join(__dirname, "../packages/prisma/schema.prisma.base");
const modelsDir = path.join(__dirname, "../packages/prisma/models");
const outputSchemaPath = path.join(__dirname, "../packages/prisma/schema.prisma");

// Read base schema
if (!fs.existsSync(schemaPath)) {
  console.error("❌ Error: Base schema file not found!");
  process.exit(1);
}

const baseSchema = fs.readFileSync(schemaPath, "utf-8");

// Read all model files and prevent duplicate models
const mergedModels = new Set();
const modelFiles = fs.readdirSync(modelsDir).map((file) => {
  const filePath = path.join(modelsDir, file);
  const content = fs.readFileSync(filePath, "utf-8");

  // Extract model names (e.g., `model User {`)
  const modelMatches = content.match(/model (\w+) {/g);
  if (modelMatches) {
    for (const match of modelMatches) {
      const modelName = match.split(" ")[1]; // Extract model name
      if (mergedModels.has(modelName)) {
        console.warn(`⚠️ Skipping duplicate model: ${modelName}`);
        return null; // Skip duplicate model
      }
      mergedModels.add(modelName);
    }
  }
  return content;
});

// Filter out skipped models and join the schema
const finalSchema = `${baseSchema}\n\n${modelFiles.filter(Boolean).join("\n\n")}`;

// Write the final schema.prisma
fs.writeFileSync(outputSchemaPath, finalSchema);

console.log("✅ Prisma schema merged successfully!");
