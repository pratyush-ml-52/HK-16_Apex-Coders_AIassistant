from flask import Flask, request, jsonify
import pandas as pd
import joblib

app = Flask(__name__)

# Load the trained model into memory when the server starts
model = joblib.load('crop_loss_model.pkl')

@app.route('/predict', methods=['POST'])
def predict():
    try:
        # 1. Receive JSON data from your Node.js backend
        incoming_data = request.json
        
        # 2. Convert it into a Pandas DataFrame
        input_df = pd.DataFrame([{
            'crop': incoming_data.get('crop'),
            'area': float(incoming_data.get('area')),
            'expYield': float(incoming_data.get('expYield')),
            'weather': incoming_data.get('weather'),
            'stage': incoming_data.get('stage')
        }])
        
        # 3. Ask the AI to predict the loss percentage
        prediction = model.predict(input_df)
        
        # 4. Send the result back to Node.js
        return jsonify({
            "predicted_loss_percentage": round(prediction[0], 2)
        })

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500
@app.route('/recommend', methods=['POST'])
def recommend_crop():
    try:
        data = request.get_json()
        weather = data.get('weather', 'normal').lower()
        
        recommendation = "Wheat 🌾"
        if "drought" in weather or "dry" in weather:
            recommendation = "Millets (Bajra) 🌾"
        elif "flood" in weather or "rain" in weather:
            recommendation = "Rice (Paddy) 🍚"
            
        return jsonify({
            "success": True, 
            "crop": recommendation,
            "message": f"Based on my analysis of {weather} conditions, I highly recommend planting **{recommendation}** this season."
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

# Start server must be at the very bottom
if __name__ == '__main__':
    print("🚀 ML Microservice running on http://localhost:5002")
    app.run(port=5002, debug=True)