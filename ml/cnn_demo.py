"""
CNN Demo — SharingIsCaring Platform
Trains a simple Convolutional Neural Network on synthetic image data.
Demonstrates GPU/CPU compute sharing for AI training workloads.
"""
import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np

print("=" * 50)
print("  CNN Training Demo — SharingIsCaring")
print("=" * 50)
print(f"PyTorch: {torch.__version__}")
print(f"Device: {'CUDA' if torch.cuda.is_available() else 'CPU'}")
print()

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# Generate synthetic image data (like MNIST: 1x8x8 images, 4 classes)
NUM_SAMPLES = 500
IMG_SIZE = 8
NUM_CLASSES = 4

np.random.seed(42)
X_data = np.random.randn(NUM_SAMPLES, 1, IMG_SIZE, IMG_SIZE).astype(np.float32)
y_data = np.random.randint(0, NUM_CLASSES, NUM_SAMPLES)

X_train = torch.tensor(X_data).to(device)
y_train = torch.tensor(y_data, dtype=torch.long).to(device)

# Simple CNN Model
class SimpleCNN(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = nn.Conv2d(1, 16, 3, padding=1)
        self.conv2 = nn.Conv2d(16, 32, 3, padding=1)
        self.pool = nn.MaxPool2d(2, 2)
        self.fc1 = nn.Linear(32 * 2 * 2, 64)
        self.fc2 = nn.Linear(64, NUM_CLASSES)
        self.relu = nn.ReLU()

    def forward(self, x):
        x = self.pool(self.relu(self.conv1(x)))
        x = self.pool(self.relu(self.conv2(x)))
        x = x.view(x.size(0), -1)
        x = self.relu(self.fc1(x))
        return self.fc2(x)

model = SimpleCNN().to(device)
criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=0.001)

print("Model Architecture:")
print(model)
print(f"\nParameters: {sum(p.numel() for p in model.parameters()):,}")
print("\nTraining...\n")

EPOCHS = 30
for epoch in range(EPOCHS):
    optimizer.zero_grad()
    outputs = model(X_train)
    loss = criterion(outputs, y_train)
    loss.backward()
    optimizer.step()

    _, predicted = torch.max(outputs, 1)
    accuracy = (predicted == y_train).float().mean() * 100

    if (epoch + 1) % 5 == 0:
        print(f"  Epoch {epoch+1:3d}/{EPOCHS} | Loss: {loss.item():.4f} | Acc: {accuracy:.1f}%")

print("\n✅ Training Complete!")
print(f"Final Loss: {loss.item():.4f}")
print(f"Final Accuracy: {accuracy:.1f}%")
print("=" * 50)
