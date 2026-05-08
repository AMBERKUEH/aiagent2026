import dotenv from "dotenv";

dotenv.config();

async function listModels() {
  const apiKey = process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.error("VITE_GEMINI_API_KEY not found in .env");
    return;
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!response.ok) {
        console.error("Failed to fetch models:", response.status, await response.text());
        return;
    }
    const data = await response.json();
    console.log("Available models:");
    data.models.forEach((model: any) => {
      console.log(`- ${model.name}`);
    });
  } catch (error) {
    console.error("Error listing models:", error);
  }
}

listModels();
