# Pagani Zonda AI Backend

This is a powerful FastAPI backend designed to securely connect your Next.js UI with Google's GenAI `gemini-2.5-flash` model.

## Setup Requirements
Python 3.8+ is required.

## Running the Server
1. Open your terminal in this directory: `cd c:/workshop1/backend`
2. Activate your virtual environment: 
   - Windows: `.\.venv\Scripts\activate`
   - Mac/Linux: `source .venv/bin/activate`
3. Run the application:
   ```bash
   uvicorn main:app --reload
   ```

The server will start at `http://localhost:8000`. You can visit `http://localhost:8000/docs` to see the automated interactive API documentation (Swagger UI).

## Connecting the UI

You can call this API from your Next.js React code like so:

```javascript
const getAIResponse = async (userPrompt) => {
  const res = await fetch("http://localhost:8000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: userPrompt })
  });
  
  const data = await res.json();
  console.log("AI says:", data.response);
  return data.response;
}
```
