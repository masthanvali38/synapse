import urllib.request
import json
import urllib.error

# Your provided API key
API_KEY = "AIzaSyB9KhNZq6wOAARl18lGffU1GWY10T1EeOM"

# The endpoint for the Gemini API. 
# Using gemini-2.5-flash since you requested it and it is available on this key.
url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={API_KEY}"

# The data payload we want to send to the AI
data = {
    "contents": [{
        "parts": [{"text": "Hello! Can you confirm you received my API request?"}]
    }]
}

# Convert the dictionary to a JSON formatted string, then encode it as bytes
payload = json.dumps(data).encode('utf-8')

# Create the request object, specifying the URL, payload, and headers
req = urllib.request.Request(url, data=payload, method="POST")
req.add_header("Content-Type", "application/json")

print("Sending request to Gemini API...")
try:
    # Execute the request
    with urllib.request.urlopen(req) as response:
        print(f"Status Code: {response.status}")
        
        # Read and decode the response body
        response_body = response.read().decode('utf-8')
        response_json = json.loads(response_body)
        
        # Extract and print the generated text from the JSON response
        print("\n--- Gemini Response ---")
        print(response_json['candidates'][0]['content']['parts'][0]['text'])
        print("-----------------------")

except urllib.error.HTTPError as e:
    print(f"\nHTTP Error: {e.code} {e.reason}")
    print(e.read().decode('utf-8'))
except Exception as e:
    print(f"\nAn error occurred: {e}")
