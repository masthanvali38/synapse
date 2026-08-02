from google import genai

API_KEY = "AIzaSyCKzQKHvl5rTHxkUlHtxCU2QnXNdhEyufo"
client = genai.Client(api_key=API_KEY)

print("Available Models:")
for m in client.models.list():
    print(f"Name: {m.name}, Supported Actions: {m.supported_actions}")
