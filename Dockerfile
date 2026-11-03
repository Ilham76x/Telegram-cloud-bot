FROM python:3.12-slim
WORKDIR /app
COPY bot_cloud_drive.py .
# Tidak ada pip install: bot ini hanya memakai standard library.
# Token dan config TIDAK ikut di image, dibaca dari .env saat jalan.
CMD ["python3", "bot_cloud_drive.py"]
