(function(){
"use strict";
const files={"real_api_agent.py":window.REAL_LAB.agent,"test_real_api_agent.py":window.REAL_LAB.tests,"real_embedding.py":window.REAL_LAB.embedding,...window.TEXTBOOK_LABS};
const groups=[
{id:"basic",title:"第 1–5 章 · 模型与 Agent 核心",note:"从本地查询、模型工具请求，到一次调用与多轮执行。两个测试文件用于本地验证。",names:["step_by_step.py","real_api_agent.py","test_step_by_step.py","test_real_api_agent.py"]},
{id:"enterprise",title:"第 6 章 · 企业权限与业务安全",note:"本地权限、订单隔离和重复请求实验，不调用真实模型或支付服务。",names:["enterprise_agent.py","test_enterprise_agent.py"]},
{id:"mcp",title:"第 7 章 · MCP 工具接入",note:"现代 SDK 版本实验需单独安装依赖；1.x 示例仅供兼容参考。",names:["modern_mcp_server.py","modern_mcp_agent.py","real_api_agent.py","mcp_server.py","mcp_client.py"]},
{id:"retrieval",title:"第 8 章 · 真实向量检索",note:"需要支持向量接口的模型服务，按章节设置向量模型名称。",names:["real_embedding.py","real_api_agent.py"]},
{id:"evaluation",title:"第 10 章 · 测试与评估",note:"程序逻辑测试与真实模型评估分开。第 9、11 章为架构设计练习，没有独立必下载程序。",names:["real_api_agent.py","step_by_step.py","test_real_api_agent.py","test_step_by_step.py","enterprise_agent.py","test_enterprise_agent.py"]}
];
const descriptions={
"step_by_step.py":"分阶段观察真实工具调用。local、errors、schema 无需 API；request、finish 请求真实模型。",
"real_api_agent.py":"公共业务工具与模型接口；完整多轮 Agent 执行循环。",
"test_step_by_step.py":"验证参数格式、工具名称、订单查询等确定性行为。",
"test_real_api_agent.py":"验证三种接口格式的工具结果回传和预算控制。",
"enterprise_agent.py":"本地企业权限、待审批申请与幂等演示。",
"test_enterprise_agent.py":"验证权限拒绝、租户隔离、重复申请等业务边界。",
"modern_mcp_server.py":"现代 MCP 教学服务，注册订单与制度工具。",
"modern_mcp_agent.py":"现代 MCP 客户端，发现工具并接入真实模型。",
"mcp_server.py":"旧版 MCP 1.x 兼容服务示例。",
"mcp_client.py":"旧版 MCP 1.x 兼容客户端示例。",
"real_embedding.py":"请求真实向量化接口并对三份制度计算相关性。"
};
const readme="AI Agent 工程实验包\n\n解压后，所有 .py 文件均在同一目录。先打开终端并进入此目录，再执行教材的命令。\nPython 3.11+。Windows 若 python 不可用，可用 py -3；macOS/Linux 可用 python3。\n\n第 1 章：python step_by_step.py local\n第 2 章起：按课程说明设置自己的 AGENT_API_KEY、AGENT_BASE_URL、AGENT_MODEL、AGENT_API_FORMAT=chat。\n本地错误实验：python step_by_step.py errors\n本地测试（完整包）：python -m unittest discover -v\n\n现代 MCP 实验需另建虚拟环境，按第 7 章安装对应 SDK；旧版示例不要与新版 SDK 混用。\n第 8 章需设置 AGENT_EMBEDDING_MODEL，并选择支持 /embeddings 的接口。\n所有业务数据均为虚构，不会实际退款。API 请求可能收费，勿将密钥写入代码或笔记。\n在线接口和现代 MCP 联调结果以你实际运行环境为准。\n";
function crc32(bytes){let crc=0xffffffff;for(const x of bytes){crc^=x;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return (crc^0xffffffff)>>>0}
function zipBytes(entries){
const enc=new TextEncoder(),locals=[],central=[];let offset=0,centralSize=0;
for(const [name,source] of entries){
 const n=enc.encode(name),data=enc.encode(source),crc=crc32(data);
 const l=new Uint8Array(30+n.length),v=new DataView(l.buffer);
 v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,0x21,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,n.length,true);l.set(n,30);
 const c=new Uint8Array(46+n.length),w=new DataView(c.buffer);
 w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint16(14,0x21,true);w.setUint32(16,crc,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,n.length,true);w.setUint32(42,offset,true);c.set(n,46);
 locals.push(l,data);central.push(c);offset+=l.length+data.length;centralSize+=c.length;
}
const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
const out=new Uint8Array(offset+centralSize+22);let pos=0;for(const b of [...locals,...central,end]){out.set(b,pos);pos+=b.length}return out;
}
function save(name,bytes,type){const url=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function pack(names,id){const entries=[["README.txt",readme],...names.map(n=>{if(typeof files[n]!=="string")throw Error("文件缺失："+n);return[n,files[n]]})];save("agent-lab-"+id+".zip",zipBytes(entries),"application/zip")}
function el(tag,cls,text){const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x}
const root=document.getElementById("groups");document.getElementById("count").textContent=Object.keys(files).length+" 个 Python 文件 · 页面内直接生成 ZIP";
document.getElementById("all").onclick=()=>pack(Object.keys(files),"all");
for(const group of groups){const section=el("section","panel");section.id=group.id;const h=el("div","heading");h.append(el("h2","",group.title));const b=el("button","btn","下载本组 ZIP");b.onclick=()=>pack(group.names,group.id);h.append(b);section.append(h,el("p","muted",group.note));for(const name of group.names){const row=el("div","file");const info=el("div");info.append(el("strong","",name),el("p","muted",descriptions[name]));const btn=el("button","btn","下载 .py");btn.onclick=()=>save(name,files[name],"text/plain;charset=utf-8");row.append(info,btn);section.append(row)}root.append(section)}
const from=new URLSearchParams(location.search).get("from");if(/^([1-9]|10|11)$/.test(from||"")){const back=document.querySelector("nav a");if(back)back.href="index.html#chapter-"+from}
if(location.hash){const target=document.getElementById(location.hash.slice(1));if(target)target.scrollIntoView()}
})();