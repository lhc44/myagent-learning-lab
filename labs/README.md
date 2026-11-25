# 实验指南
在仓库根目录运行 python -m unittest discover -s labs -v，再运行 python labs/agent.py。标准库实验不需要 API 或 GPU。MCP 实验另建虚拟环境并安装 mcp；在线模型接口按官方文档选择兼容模型。不要提交 .env。离线模型是确定性的测试替身，不用它衡量真实模型选工具准确率。
