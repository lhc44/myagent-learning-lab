"""内存状态机：模拟审批及幂等。生产环境须持久化和事务。"""
class Workflow:
    def __init__(self, tenant):
        self.tenant = tenant
        self.state = "pending"
        self.completed = set()
        self.writes = 0

    def approve(self, tenant, role):
        if tenant != self.tenant or role != "approver":
            raise PermissionError("not authorized")
        if self.state != "pending":
            raise ValueError("invalid state")
        self.state = "approved"

    def execute(self, tenant, key):
        if tenant != self.tenant:
            raise PermissionError("wrong tenant")
        if key in self.completed:
            return "already done"
        if self.state != "approved":
            raise PermissionError("approval required")
        self.writes += 1
        self.completed.add(key)
        self.state = "done"
        return "done"

if __name__ == "__main__":
    w = Workflow("a")
    w.approve("a","approver")
    print(w.execute("a","req-1"),w.execute("a","req-1"))
