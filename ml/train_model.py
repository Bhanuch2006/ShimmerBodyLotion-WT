import os
import pandas as pd
import numpy as np

print("Loading dataset...")

current_dir = os.path.dirname(os.path.abspath(__file__))
csv_path = os.path.join(current_dir, "data.csv")

data = pd.read_csv(csv_path)

X = data['x'].values
y = data['y'].values

m, b = 0.0, 0.0
lr = 0.01
epochs = 100

print("Starting training...\n")

for epoch in range(epochs):
    y_pred = m * X + b
    loss = np.mean((y - y_pred) ** 2)

    dm = -2 * np.mean(X * (y - y_pred))
    db = -2 * np.mean(y - y_pred)

    m -= lr * dm
    b -= lr * db

    if epoch % 20 == 0:
        print(f"Epoch {epoch} | Loss: {loss:.4f}")

print("\nTraining complete!")

print(f"\nm = {m:.4f}")
print(f"b = {b:.4f}")

pred = m * 6 + b
print(f"\nPrediction for x=6 -> y={pred:.2f}")