from google import genai
import sys

API_KEY = "AIzaSyBm5hqsMDzoYTR9H7Km2IMpLC1LCcdcJ2s"
try:
    client = genai.Client(api_key=API_KEY)
    print("Client initialized")
    models = list(client.models.list())
    print(f"Successfully listed {len(models)} models")
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
