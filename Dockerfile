FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TZ=Asia/Shanghai

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -i https://mirrors.aliyun.com/pypi/simple/ -r requirements.txt

COPY main_app.py ./
COPY templates ./templates
COPY static ./static
COPY grades ./grades
COPY config.json ./.secret_key ./
RUN mkdir -p log

EXPOSE 5001
CMD ["python", "main_app.py"]
