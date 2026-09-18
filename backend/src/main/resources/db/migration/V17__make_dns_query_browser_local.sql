UPDATE tool_definition
SET description = '由当前浏览器直接查询多个公共 DNS，比较 A、AAAA、CNAME、MX、TXT、NS、CAA 记录、TTL 与解析链路',
    execution_mode = 'CLIENT',
    backend_key = NULL
WHERE slug = 'dns-query';
