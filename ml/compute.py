import numpy as np

print(" Running heavy computation...")

arr = np.random.rand(1000, 1000)
result = np.dot(arr, arr)

print(" Computation done!")
print("Result shape:", result.shape)