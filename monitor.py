#!/usr/bin/env python
# coding=UTF-8
"""
系统性能监控脚本
用于监控AQS系统的性能指标和资源使用情况
"""

import time
import psutil
import pymongo
import json
from datetime import datetime
import logging
import os

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('log/monitor.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# 数据库连接配置
MONGODB_URI = "mongodb://127.0.0.1:27017/"
DB_NAME = "aqs"

# 性能阈值设置
CPU_THRESHOLD = 80  # CPU使用率阈值(%)
MEMORY_THRESHOLD = 80  # 内存使用率阈值(%)
DISK_THRESHOLD = 85  # 磁盘使用率阈值(%)
DB_CONNECTION_THRESHOLD = 50  # 数据库连接数阈值

def get_system_stats():
    """获取系统性能指标"""
    try:
        # CPU使用率
        cpu_percent = psutil.cpu_percent(interval=1)

        # 内存使用情况
        memory = psutil.virtual_memory()
        memory_percent = memory.percent

        # 磁盘使用情况
        disk = psutil.disk_usage('/')
        disk_percent = disk.percent

        # 网络IO
        net_io = psutil.net_io_counters()

        return {
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "cpu_percent": cpu_percent,
            "memory_percent": memory_percent,
            "memory_used_gb": memory.used / (1024**3),
            "memory_total_gb": memory.total / (1024**3),
            "disk_percent": disk_percent,
            "disk_used_gb": disk.used / (1024**3),
            "disk_total_gb": disk.total / (1024**3),
            "network_bytes_sent": net_io.bytes_sent,
            "network_bytes_recv": net_io.bytes_recv
        }
    except Exception as e:
        logger.error(f"获取系统指标失败: {str(e)}")
        return None

def get_database_stats():
    """获取数据库性能指标"""
    try:
        client = pymongo.MongoClient(MONGODB_URI)
        db = client[DB_NAME]

        # 获取数据库状态
        db_status = db.command("dbStats")

        # 获取集合统计
        collections = {}
        for collection_name in db.list_collection_names():
            collection = db[collection_name]
            collections[collection_name] = {
                "count": collection.count_documents({}),
                "size": collection.estimated_document_count()  # 近似文档数量
            }

        # 获取服务器状态
        server_status = db.command("serverStatus")
        connections = server_status.get("connections", {})

        return {
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "database_size_mb": db_status.get("dataSize", 0) / (1024**2),
            "storage_size_mb": db_status.get("storageSize", 0) / (1024**2),
            "collections": collections,
            "connections": {
                "current": connections.get("current", 0),
                "available": connections.get("available", 0),
                "total_created": connections.get("totalCreated", 0)
            }
        }
    except Exception as e:
        logger.error(f"获取数据库指标失败: {str(e)}")
        return None

def check_alerts(system_stats, db_stats):
    """检查性能指标是否超过阈值"""
    alerts = []

    if system_stats:
        if system_stats["cpu_percent"] > CPU_THRESHOLD:
            alerts.append(f"CPU使用率过高: {system_stats['cpu_percent']}% > {CPU_THRESHOLD}%")

        if system_stats["memory_percent"] > MEMORY_THRESHOLD:
            alerts.append(f"内存使用率过高: {system_stats['memory_percent']}% > {MEMORY_THRESHOLD}%")

        if system_stats["disk_percent"] > DISK_THRESHOLD:
            alerts.append(f"磁盘使用率过高: {system_stats['disk_percent']}% > {DISK_THRESHOLD}%")

    if db_stats:
        current_connections = db_stats["connections"]["current"]
        if current_connections > DB_CONNECTION_THRESHOLD:
            alerts.append(f"数据库连接数过高: {current_connections} > {DB_CONNECTION_THRESHOLD}")

    return alerts

def save_stats(system_stats, db_stats, alerts):
    """保存性能指标和警报到文件"""
    try:
        os.makedirs('log/performance', exist_ok=True)

        # 保存系统指标
        with open('log/performance/system_stats.json', 'a') as f:
            if system_stats:
                f.write(json.dumps(system_stats) + '')

        # 保存数据库指标
        with open('log/performance/db_stats.json', 'a') as f:
            if db_stats:
                f.write(json.dumps(db_stats) + '')

        # 保存警报
        if alerts:
            with open('log/performance/alerts.log', 'a') as f:
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                f.write(f"[{timestamp}] 性能警报:")
                for alert in alerts:
                    f.write(f"  - {alert}")
                f.write("\n")

    except Exception as e:
        logger.error(f"保存性能指标失败: {str(e)}")

def main():
    """主函数：定期收集和检查性能指标"""
    logger.info("启动性能监控系统")

    while True:
        try:
            # 获取系统指标
            system_stats = get_system_stats()
            if system_stats:
                logger.info(f"系统指标 - CPU: {system_stats['cpu_percent']}%, 内存: {system_stats['memory_percent']}%, 磁盘: {system_stats['disk_percent']}%")

            # 获取数据库指标
            db_stats = get_database_stats()
            if db_stats:
                logger.info(f"数据库指标 - 连接数: {db_stats['connections']['current']}, 数据库大小: {db_stats['database_size_mb']:.2f}MB")

            # 检查警报
            alerts = check_alerts(system_stats, db_stats)
            if alerts:
                for alert in alerts:
                    logger.warning(alert)

            # 保存指标
            save_stats(system_stats, db_stats, alerts)

            # 等待下一次检查
            time.sleep(60)  # 每分钟检查一次

        except KeyboardInterrupt:
            logger.info("停止性能监控系统")
            break
        except Exception as e:
            logger.error(f"监控过程中出错: {str(e)}")
            time.sleep(60)  # 出错后等待一分钟再继续

if __name__ == "__main__":
    main()
