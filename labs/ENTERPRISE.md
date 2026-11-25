# 累进企业项目

Python 3.11+，无额外依赖。运行 `python labs/enterprise_agent.py`，预期返回 paid；运行 `python -m unittest discover -s labs -v` 验证。四工具、租户隔离、目录过滤、参数验证、调用预算、SQLite 幂等与审计。FakeModel 不代表真实语义能力；退款只创建 pending 申请，未实现真实审批执行、分布式事务、远程 MCP、真实模型适配、身份系统与生产部署。依次替换 FakeModel、接 MCP、增加审批状态机和真实模型评估。