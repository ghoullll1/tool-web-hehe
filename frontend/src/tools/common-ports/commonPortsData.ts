export type PortTransport = 'TCP' | 'UDP'

export type PortCategoryId =
  | 'web'
  | 'file'
  | 'email'
  | 'remote'
  | 'infrastructure'
  | 'directory'
  | 'database'
  | 'messaging'
  | 'devops'
  | 'media'
  | 'tunnel'

export type PortSecurity = 'plain' | 'optional' | 'encrypted'

export interface CommonPort {
  port: number
  service: string
  name: string
  category: PortCategoryId
  transports: readonly PortTransport[]
  security: PortSecurity
  summary: string
  aliases?: readonly string[]
  note?: string
}

export interface PortCategory {
  id: PortCategoryId
  label: string
  shortLabel: string
}

export const PORT_CATEGORIES: readonly PortCategory[] = [
  { id: 'web', label: 'Web 与代理', shortLabel: 'Web' },
  { id: 'file', label: '文件与存储', shortLabel: '文件' },
  { id: 'email', label: '邮件服务', shortLabel: '邮件' },
  { id: 'remote', label: '远程访问', shortLabel: '远程' },
  { id: 'infrastructure', label: '网络基础设施', shortLabel: '网络' },
  { id: 'directory', label: '目录与认证', shortLabel: '认证' },
  { id: 'database', label: '数据库与缓存', shortLabel: '数据' },
  { id: 'messaging', label: '消息与实时通信', shortLabel: '消息' },
  { id: 'devops', label: '开发与运维', shortLabel: '运维' },
  { id: 'media', label: '音视频与流媒体', shortLabel: '媒体' },
  { id: 'tunnel', label: 'VPN 与隧道', shortLabel: '隧道' },
]

export const COMMON_PORTS: readonly CommonPort[] = [
  { port: 20, service: 'FTP-DATA', name: 'FTP 数据通道', category: 'file', transports: ['TCP'], security: 'plain', summary: 'FTP 主动模式用于传输文件内容的数据连接。', aliases: ['ftp data'] },
  { port: 21, service: 'FTP', name: '文件传输协议', category: 'file', transports: ['TCP'], security: 'plain', summary: 'FTP 控制通道，用于登录、目录浏览和传输命令。', note: '用户名、密码和内容默认明文传输，公网环境优先使用 SFTP 或 FTPS。' },
  { port: 22, service: 'SSH', name: '安全外壳协议', category: 'remote', transports: ['TCP'], security: 'encrypted', summary: '用于加密远程登录、命令执行、端口转发，也承载 SFTP 与 SCP。', aliases: ['sftp', 'scp', 'secure shell'] },
  { port: 23, service: 'TELNET', name: 'Telnet 远程终端', category: 'remote', transports: ['TCP'], security: 'plain', summary: '早期明文远程终端协议，仍可能出现在网络设备和遗留系统中。', note: '不提供传输加密，不应暴露到不可信网络。' },
  { port: 25, service: 'SMTP', name: '邮件传输协议', category: 'email', transports: ['TCP'], security: 'optional', summary: '邮件服务器之间投递邮件的标准端口，客户端发信通常改用 587。', aliases: ['mail transfer'] },
  { port: 53, service: 'DNS', name: '域名系统', category: 'infrastructure', transports: ['TCP', 'UDP'], security: 'plain', summary: 'UDP 用于多数查询；TCP 用于大响应、区域传送和回退。', aliases: ['domain name system'] },
  { port: 67, service: 'DHCP-SERVER', name: 'DHCP 服务端', category: 'infrastructure', transports: ['UDP'], security: 'plain', summary: 'DHCPv4 服务端接收客户端广播并分配地址、网关和 DNS 等配置。', aliases: ['bootps'] },
  { port: 68, service: 'DHCP-CLIENT', name: 'DHCP 客户端', category: 'infrastructure', transports: ['UDP'], security: 'plain', summary: 'DHCPv4 客户端接收服务端返回的网络配置。', aliases: ['bootpc'] },
  { port: 69, service: 'TFTP', name: '简单文件传输协议', category: 'file', transports: ['UDP'], security: 'plain', summary: '轻量无连接文件传输，常用于 PXE 启动和网络设备配置。', note: '无认证和加密能力，通常只应在受控局域网使用。' },
  { port: 80, service: 'HTTP', name: '超文本传输协议', category: 'web', transports: ['TCP'], security: 'plain', summary: '未加密 Web 请求的默认端口，也常用于跳转到 HTTPS。', aliases: ['web'] },
  { port: 88, service: 'KERBEROS', name: 'Kerberos 认证', category: 'directory', transports: ['TCP', 'UDP'], security: 'optional', summary: '集中式票据认证协议，广泛用于 Active Directory 域环境。' },
  { port: 110, service: 'POP3', name: '邮局协议 v3', category: 'email', transports: ['TCP'], security: 'plain', summary: '邮件客户端从服务器下载邮件的传统协议。', note: '加密连接通常使用 POP3S 995。' },
  { port: 111, service: 'RPCBIND', name: 'RPC 端口映射', category: 'infrastructure', transports: ['TCP', 'UDP'], security: 'plain', summary: '将 ONC RPC 程序号映射到实际服务端口，NFS 环境中较常见。', aliases: ['portmapper'] },
  { port: 115, service: 'SFTP', name: 'Simple File Transfer', category: 'file', transports: ['TCP'], security: 'plain', summary: 'IANA 登记的 Simple File Transfer Protocol；并非通常运行在 SSH 22 上的 SFTP。', note: '日常所说的 SSH File Transfer Protocol 通常使用 22 端口。' },
  { port: 119, service: 'NNTP', name: '网络新闻传输协议', category: 'messaging', transports: ['TCP'], security: 'plain', summary: '用于 Usenet 新闻组文章的发布、同步与读取。' },
  { port: 123, service: 'NTP', name: '网络时间协议', category: 'infrastructure', transports: ['UDP'], security: 'plain', summary: '用于计算机、网络设备和服务器之间的时钟同步。' },
  { port: 135, service: 'MSRPC', name: 'Microsoft RPC 端点映射', category: 'infrastructure', transports: ['TCP', 'UDP'], security: 'plain', summary: 'Windows RPC 客户端用于发现动态服务端点。', aliases: ['epmap', 'dcerpc'] },
  { port: 137, service: 'NETBIOS-NS', name: 'NetBIOS 名称服务', category: 'infrastructure', transports: ['UDP'], security: 'plain', summary: '旧式 Windows 网络中的主机名注册与解析。' },
  { port: 138, service: 'NETBIOS-DGM', name: 'NetBIOS 数据报服务', category: 'infrastructure', transports: ['UDP'], security: 'plain', summary: '旧式 Windows 网络中的无连接数据报与浏览通知。' },
  { port: 139, service: 'NETBIOS-SSN', name: 'NetBIOS 会话服务', category: 'file', transports: ['TCP'], security: 'plain', summary: '早期 SMB 文件与打印共享使用的会话端口。' },
  { port: 143, service: 'IMAP', name: '互联网邮件访问协议', category: 'email', transports: ['TCP'], security: 'optional', summary: '让客户端在服务器上同步和管理邮件，支持 STARTTLS 升级。' },
  { port: 161, service: 'SNMP', name: '简单网络管理协议', category: 'infrastructure', transports: ['UDP'], security: 'optional', summary: '网管平台读取设备指标、配置和状态的默认端口。', note: 'SNMPv3 才提供较完善的认证与加密能力。' },
  { port: 162, service: 'SNMP-TRAP', name: 'SNMP Trap 通知', category: 'infrastructure', transports: ['UDP'], security: 'optional', summary: '网络设备主动向管理平台发送告警和事件通知。' },
  { port: 179, service: 'BGP', name: '边界网关协议', category: 'infrastructure', transports: ['TCP'], security: 'optional', summary: '自治系统之间交换互联网路由信息的核心协议。' },
  { port: 194, service: 'IRC', name: 'Internet Relay Chat', category: 'messaging', transports: ['TCP'], security: 'plain', summary: 'IANA 登记的 IRC 端口，实际网络也常使用 6667。' },
  { port: 389, service: 'LDAP', name: '轻量目录访问协议', category: 'directory', transports: ['TCP', 'UDP'], security: 'optional', summary: '查询和维护目录数据，可通过 StartTLS 在原连接上启用加密。' },
  { port: 443, service: 'HTTPS', name: '加密 Web / HTTP/3', category: 'web', transports: ['TCP', 'UDP'], security: 'encrypted', summary: 'TCP 承载 HTTPS；UDP 通常承载基于 QUIC 的 HTTP/3。', aliases: ['http3', 'quic', 'secure web'] },
  { port: 445, service: 'SMB', name: 'Server Message Block', category: 'file', transports: ['TCP'], security: 'optional', summary: 'Windows 文件、打印机共享与域环境通信的直接托管端口。', aliases: ['microsoft-ds', 'cifs'] },
  { port: 464, service: 'KPASSWD', name: 'Kerberos 密码变更', category: 'directory', transports: ['TCP', 'UDP'], security: 'optional', summary: 'Kerberos/Active Directory 环境中修改或设置账户密码。' },
  { port: 465, service: 'SUBMISSIONS', name: '隐式 TLS 邮件提交', category: 'email', transports: ['TCP'], security: 'encrypted', summary: '邮件客户端通过连接建立即启用 TLS 的方式提交邮件。', aliases: ['smtps'] },
  { port: 500, service: 'IKE', name: 'IPsec 密钥交换', category: 'tunnel', transports: ['UDP'], security: 'optional', summary: 'IPsec VPN 建立安全关联和协商加密参数的端口。', aliases: ['isakmp'] },
  { port: 514, service: 'SYSLOG', name: '系统日志', category: 'infrastructure', transports: ['UDP'], security: 'plain', summary: '设备和系统发送传统 Syslog 日志的默认 UDP 端口。', note: '需要 TLS 保护时通常使用 6514。' },
  { port: 515, service: 'LPD', name: '行式打印机服务', category: 'file', transports: ['TCP'], security: 'plain', summary: 'Unix/Linux 与网络打印机使用的传统打印队列协议。' },
  { port: 520, service: 'RIP', name: '路由信息协议', category: 'infrastructure', transports: ['UDP'], security: 'plain', summary: 'IPv4 距离矢量内部网关路由协议。' },
  { port: 521, service: 'RIPNG', name: 'RIPng', category: 'infrastructure', transports: ['UDP'], security: 'plain', summary: '面向 IPv6 网络的 Routing Information Protocol。' },
  { port: 546, service: 'DHCPV6-CLIENT', name: 'DHCPv6 客户端', category: 'infrastructure', transports: ['UDP'], security: 'plain', summary: 'IPv6 客户端接收 DHCPv6 地址和网络配置。' },
  { port: 547, service: 'DHCPV6-SERVER', name: 'DHCPv6 服务端', category: 'infrastructure', transports: ['UDP'], security: 'plain', summary: 'DHCPv6 服务端或中继接收客户端请求。' },
  { port: 554, service: 'RTSP', name: '实时流协议', category: 'media', transports: ['TCP', 'UDP'], security: 'optional', summary: '控制流媒体播放、暂停和会话，媒体数据常由 RTP 承载。' },
  { port: 587, service: 'SUBMISSION', name: '邮件提交', category: 'email', transports: ['TCP'], security: 'optional', summary: '邮件客户端向发送服务器提交邮件的推荐端口，通常使用 STARTTLS。' },
  { port: 631, service: 'IPP', name: '互联网打印协议', category: 'file', transports: ['TCP', 'UDP'], security: 'optional', summary: '打印任务提交、队列管理和打印机能力发现，CUPS 默认使用。' },
  { port: 636, service: 'LDAPS', name: 'LDAP over TLS', category: 'directory', transports: ['TCP'], security: 'encrypted', summary: '从连接开始即通过 TLS 保护的目录访问。' },
  { port: 853, service: 'DOT', name: 'DNS over TLS', category: 'infrastructure', transports: ['TCP'], security: 'encrypted', summary: '通过 TLS 加密 DNS 查询，降低链路窃听和篡改风险。', aliases: ['dns tls'] },
  { port: 873, service: 'RSYNC', name: 'Rsync 文件同步', category: 'file', transports: ['TCP'], security: 'plain', summary: 'Rsync 守护进程模式的文件差异同步端口。', note: '原生守护进程不等同于经 SSH 加密的 rsync。' },
  { port: 989, service: 'FTPS-DATA', name: 'FTPS 数据通道', category: 'file', transports: ['TCP'], security: 'encrypted', summary: '隐式 TLS FTP 的数据连接端口。' },
  { port: 990, service: 'FTPS', name: 'FTPS 控制通道', category: 'file', transports: ['TCP'], security: 'encrypted', summary: '连接建立即启用 TLS 的 FTP 控制通道。' },
  { port: 993, service: 'IMAPS', name: 'IMAP over TLS', category: 'email', transports: ['TCP'], security: 'encrypted', summary: '从连接开始即通过 TLS 加密的邮件同步协议。' },
  { port: 995, service: 'POP3S', name: 'POP3 over TLS', category: 'email', transports: ['TCP'], security: 'encrypted', summary: '从连接开始即通过 TLS 加密的邮件下载协议。' },
  { port: 1080, service: 'SOCKS', name: 'SOCKS 代理', category: 'tunnel', transports: ['TCP', 'UDP'], security: 'optional', summary: '通用代理协议，SOCKS5 可代理 TCP 并支持 UDP 转发。' },
  { port: 1194, service: 'OPENVPN', name: 'OpenVPN', category: 'tunnel', transports: ['TCP', 'UDP'], security: 'encrypted', summary: 'OpenVPN 的常见默认监听端口，实际部署可自由调整。' },
  { port: 1433, service: 'MSSQL', name: 'Microsoft SQL Server', category: 'database', transports: ['TCP'], security: 'optional', summary: 'SQL Server 默认数据库引擎连接端口。', aliases: ['sql server', 'tds'] },
  { port: 1434, service: 'SQL-BROWSER', name: 'SQL Server Browser', category: 'database', transports: ['UDP'], security: 'plain', summary: '发现 SQL Server 命名实例及其动态端口。' },
  { port: 1521, service: 'ORACLE', name: 'Oracle TNS Listener', category: 'database', transports: ['TCP'], security: 'optional', summary: 'Oracle 数据库监听器的常见默认端口。', aliases: ['tns'] },
  { port: 1701, service: 'L2TP', name: '第二层隧道协议', category: 'tunnel', transports: ['UDP'], security: 'plain', summary: '建立二层 VPN 隧道，通常与 IPsec 配合提供加密。' },
  { port: 1723, service: 'PPTP', name: '点对点隧道协议', category: 'tunnel', transports: ['TCP'], security: 'plain', summary: '传统 VPN 控制通道，另需 GRE 承载数据。', note: 'PPTP 已不满足现代安全要求。' },
  { port: 1812, service: 'RADIUS', name: 'RADIUS 认证', category: 'directory', transports: ['UDP'], security: 'optional', summary: '网络接入的认证、授权请求端口。' },
  { port: 1813, service: 'RADIUS-ACCT', name: 'RADIUS 计费', category: 'directory', transports: ['UDP'], security: 'optional', summary: '记录网络接入会话开始、结束和流量等计费信息。' },
  { port: 1883, service: 'MQTT', name: 'MQTT 消息协议', category: 'messaging', transports: ['TCP'], security: 'plain', summary: '物联网发布/订阅消息的未加密默认端口。' },
  { port: 1935, service: 'RTMP', name: '实时消息协议', category: 'media', transports: ['TCP'], security: 'plain', summary: '直播推流与流媒体分发中常见的 RTMP 端口。' },
  { port: 2049, service: 'NFS', name: '网络文件系统', category: 'file', transports: ['TCP', 'UDP'], security: 'optional', summary: 'Unix/Linux 主机之间挂载远程文件系统；现代 NFS 通常使用 TCP。' },
  { port: 2181, service: 'ZOOKEEPER', name: 'Apache ZooKeeper', category: 'devops', transports: ['TCP'], security: 'optional', summary: 'ZooKeeper 客户端连接和分布式协调的常见端口。' },
  { port: 2375, service: 'DOCKER', name: 'Docker API（明文）', category: 'devops', transports: ['TCP'], security: 'plain', summary: '未启用 TLS 的 Docker Engine 远程 API 约定端口。', note: '拥有此接口通常等同于拥有宿主机高权限，禁止直接暴露公网。' },
  { port: 2376, service: 'DOCKER-TLS', name: 'Docker API（TLS）', category: 'devops', transports: ['TCP'], security: 'encrypted', summary: '通过双向 TLS 保护的 Docker Engine 远程 API 约定端口。' },
  { port: 3000, service: 'DEV-HTTP', name: '开发服务器', category: 'devops', transports: ['TCP'], security: 'plain', summary: '前端开发服务器、Grafana 等应用常用的约定端口，并非单一服务专属。', aliases: ['grafana', 'node dev server'] },
  { port: 3128, service: 'HTTP-PROXY', name: 'HTTP 代理', category: 'web', transports: ['TCP'], security: 'optional', summary: 'Squid 等正向代理和缓存服务常用端口。', aliases: ['squid'] },
  { port: 3268, service: 'LDAP-GC', name: 'Active Directory 全局编录', category: 'directory', transports: ['TCP'], security: 'plain', summary: '跨域搜索 Active Directory 林中对象的全局编录端口。' },
  { port: 3269, service: 'LDAP-GC-TLS', name: '加密全局编录', category: 'directory', transports: ['TCP'], security: 'encrypted', summary: '通过 TLS 访问 Active Directory 全局编录。' },
  { port: 3306, service: 'MYSQL', name: 'MySQL / MariaDB', category: 'database', transports: ['TCP'], security: 'optional', summary: 'MySQL 兼容数据库的默认客户端连接端口。' },
  { port: 3389, service: 'RDP', name: '远程桌面协议', category: 'remote', transports: ['TCP', 'UDP'], security: 'optional', summary: 'Windows 图形化远程桌面；UDP 可改善现代 RDP 的传输体验。' },
  { port: 3478, service: 'STUN-TURN', name: 'NAT 穿透服务', category: 'media', transports: ['TCP', 'UDP'], security: 'optional', summary: 'WebRTC、VoIP 用于发现公网映射或中继媒体流量。' },
  { port: 4222, service: 'NATS', name: 'NATS 客户端', category: 'messaging', transports: ['TCP'], security: 'optional', summary: 'NATS 消息系统客户端连接的常见默认端口。' },
  { port: 4369, service: 'EPMD', name: 'Erlang 端口映射', category: 'devops', transports: ['TCP'], security: 'plain', summary: 'Erlang 节点发现服务，RabbitMQ 集群等场景会使用。' },
  { port: 4500, service: 'IPSEC-NAT-T', name: 'IPsec NAT Traversal', category: 'tunnel', transports: ['UDP'], security: 'optional', summary: '让 IPsec ESP 流量穿越 NAT 设备的 UDP 封装端口。' },
  { port: 5060, service: 'SIP', name: '会话发起协议', category: 'messaging', transports: ['TCP', 'UDP'], security: 'plain', summary: 'VoIP 呼叫注册、建立和控制的未加密默认端口。' },
  { port: 5061, service: 'SIPS', name: 'SIP over TLS', category: 'messaging', transports: ['TCP'], security: 'encrypted', summary: '通过 TLS 保护的 SIP 信令端口。' },
  { port: 5222, service: 'XMPP-CLIENT', name: 'XMPP 客户端连接', category: 'messaging', transports: ['TCP'], security: 'optional', summary: '即时通信客户端连接 XMPP 服务端，通常使用 StartTLS。' },
  { port: 5269, service: 'XMPP-SERVER', name: 'XMPP 服务端互联', category: 'messaging', transports: ['TCP'], security: 'optional', summary: '不同 XMPP 域之间的服务端到服务端通信。' },
  { port: 5353, service: 'MDNS', name: '多播 DNS', category: 'infrastructure', transports: ['UDP'], security: 'plain', summary: '局域网内无需集中 DNS 的 `.local` 名称与服务发现。', aliases: ['bonjour'] },
  { port: 5432, service: 'POSTGRESQL', name: 'PostgreSQL', category: 'database', transports: ['TCP'], security: 'optional', summary: 'PostgreSQL 数据库的默认客户端连接端口。', aliases: ['postgres'] },
  { port: 5601, service: 'KIBANA', name: 'Kibana Web', category: 'devops', transports: ['TCP'], security: 'optional', summary: 'Kibana 管理和数据可视化界面的常见默认端口。' },
  { port: 5671, service: 'AMQPS', name: 'AMQP over TLS', category: 'messaging', transports: ['TCP'], security: 'encrypted', summary: '通过 TLS 保护的 AMQP 消息连接。' },
  { port: 5672, service: 'AMQP', name: '高级消息队列协议', category: 'messaging', transports: ['TCP'], security: 'optional', summary: 'RabbitMQ 等消息代理的 AMQP 客户端默认端口。' },
  { port: 5900, service: 'VNC', name: '虚拟网络计算', category: 'remote', transports: ['TCP'], security: 'optional', summary: '跨平台图形桌面远程控制的基础显示端口。' },
  { port: 5985, service: 'WINRM-HTTP', name: 'Windows 远程管理', category: 'remote', transports: ['TCP'], security: 'optional', summary: 'WinRM/WS-Management 的 HTTP 传输端口。' },
  { port: 5986, service: 'WINRM-HTTPS', name: '加密 Windows 远程管理', category: 'remote', transports: ['TCP'], security: 'encrypted', summary: '通过 HTTPS 保护的 WinRM/WS-Management。' },
  { port: 6379, service: 'REDIS', name: 'Redis', category: 'database', transports: ['TCP'], security: 'optional', summary: 'Redis 内存数据库和缓存服务的默认端口。', note: '应启用认证与网络访问控制，避免直接暴露公网。' },
  { port: 6443, service: 'KUBE-API', name: 'Kubernetes API Server', category: 'devops', transports: ['TCP'], security: 'encrypted', summary: 'Kubernetes 控制平面 API 的常见安全端口。', aliases: ['k8s', 'kubernetes'] },
  { port: 6514, service: 'SYSLOG-TLS', name: 'Syslog over TLS', category: 'infrastructure', transports: ['TCP'], security: 'encrypted', summary: '通过 TLS 可靠且加密地传输 Syslog 消息。' },
  { port: 6667, service: 'IRC', name: 'IRC 常用端口', category: 'messaging', transports: ['TCP'], security: 'plain', summary: 'IRC 网络长期广泛使用的约定明文端口。' },
  { port: 7848, service: 'NACOS-JRAFT', name: 'Nacos JRaft 集群通信', category: 'devops', transports: ['TCP'], security: 'plain', summary: 'Nacos Server 节点之间处理 Raft 请求的默认端口，通常由主端口减 1000 得到。', aliases: ['nacos', 'jraft', 'raft'], note: '仅允许 Nacos Server 节点互通，不应向客户端或公网开放。' },
  { port: 8080, service: 'HTTP-ALT', name: 'HTTP 备用端口与管理控制台', category: 'web', transports: ['TCP'], security: 'plain', summary: '应用服务器、代理和管理界面常用的 HTTP 约定端口；Nacos 3.x 默认在此提供独立控制台。', aliases: ['nacos', 'nacos console', 'admin console'], note: '这是多个产品共享的约定端口，实际服务需结合部署配置确认。' },
  { port: 8081, service: 'HTTP-ALT', name: 'HTTP 备用端口', category: 'web', transports: ['TCP'], security: 'plain', summary: '当 8080 被占用时常见的第二 Web/管理界面端口。' },
  { port: 8443, service: 'HTTPS-ALT', name: 'HTTPS 备用端口', category: 'web', transports: ['TCP'], security: 'encrypted', summary: '应用服务器和管理控制台常用的加密 Web 约定端口。' },
  { port: 8500, service: 'CONSUL', name: 'Consul HTTP API', category: 'devops', transports: ['TCP'], security: 'optional', summary: 'Consul UI、HTTP API 和服务发现查询的常见端口。' },
  { port: 8554, service: 'RTSP-ALT', name: 'RTSP 备用端口', category: 'media', transports: ['TCP', 'UDP'], security: 'optional', summary: '摄像头、媒体服务和开发环境常见的 RTSP 约定端口。' },
  { port: 8848, service: 'NACOS-HTTP', name: 'Nacos 主服务 / OpenAPI', category: 'devops', transports: ['TCP'], security: 'plain', summary: 'Nacos Server 的默认主端口，用于 HTTP OpenAPI、Admin API 与部分插件请求。', aliases: ['nacos', 'service discovery', 'config center', '注册中心', '配置中心'], note: 'Nacos 是内网微服务组件，应启用认证和网络隔离，避免直接暴露公网。' },
  { port: 8883, service: 'MQTTS', name: 'MQTT over TLS', category: 'messaging', transports: ['TCP'], security: 'encrypted', summary: '通过 TLS 保护的 MQTT 发布/订阅消息端口。' },
  { port: 9000, service: 'APP-ADMIN', name: '应用与对象存储控制台', category: 'devops', transports: ['TCP'], security: 'optional', summary: 'MinIO API、Portainer、SonarQube 等产品常使用的约定端口，具体用途取决于部署。', aliases: ['minio', 'portainer', 'sonarqube'] },
  { port: 9042, service: 'CASSANDRA', name: 'Apache Cassandra CQL', category: 'database', transports: ['TCP'], security: 'optional', summary: 'Cassandra 客户端通过 CQL Native Protocol 连接的默认端口。' },
  { port: 9090, service: 'PROMETHEUS', name: 'Prometheus', category: 'devops', transports: ['TCP'], security: 'optional', summary: 'Prometheus Web UI、查询 API 和监控服务常用端口。' },
  { port: 9092, service: 'KAFKA', name: 'Apache Kafka', category: 'messaging', transports: ['TCP'], security: 'optional', summary: 'Kafka Broker 客户端连接的常见默认端口。' },
  { port: 9200, service: 'ELASTICSEARCH', name: 'Elasticsearch HTTP API', category: 'database', transports: ['TCP'], security: 'optional', summary: 'Elasticsearch REST 查询和管理接口的常见端口。' },
  { port: 9300, service: 'ES-TRANSPORT', name: 'Elasticsearch 节点传输', category: 'database', transports: ['TCP'], security: 'optional', summary: 'Elasticsearch 节点间通信的常见传输端口。' },
  { port: 9418, service: 'GIT', name: 'Git 原生协议', category: 'file', transports: ['TCP'], security: 'plain', summary: 'Git daemon 提供匿名或只读仓库访问的原生端口。' },
  { port: 9848, service: 'NACOS-GRPC-CLIENT', name: 'Nacos 客户端 gRPC', category: 'devops', transports: ['TCP'], security: 'plain', summary: 'Nacos 客户端连接服务端的默认 gRPC 端口，通常由主端口加 1000 得到。', aliases: ['nacos', 'nacos grpc', 'service discovery'], note: '经 VIP、SLB 或 Nginx 转发时应使用 TCP 转发，不要配置为 HTTP/HTTP2 代理。' },
  { port: 9849, service: 'NACOS-GRPC-SERVER', name: 'Nacos 服务端 gRPC', category: 'devops', transports: ['TCP'], security: 'plain', summary: 'Nacos Server 节点间同步使用的默认 gRPC 端口，通常由主端口加 1001 得到。', aliases: ['nacos', 'nacos grpc', 'cluster sync'], note: '属于服务端集群内部通信端口，只允许 Nacos Server 节点互通。' },
  { port: 10250, service: 'KUBELET', name: 'Kubernetes Kubelet API', category: 'devops', transports: ['TCP'], security: 'encrypted', summary: '控制平面访问节点 Kubelet API 和容器日志等能力的安全端口。' },
  { port: 11211, service: 'MEMCACHED', name: 'Memcached', category: 'database', transports: ['TCP', 'UDP'], security: 'plain', summary: '分布式内存缓存服务的默认端口。', note: 'UDP 模式存在放大攻击风险，通常应禁用并限制网络边界。' },
  { port: 15672, service: 'RABBITMQ-UI', name: 'RabbitMQ 管理界面', category: 'devops', transports: ['TCP'], security: 'optional', summary: 'RabbitMQ Management 插件的 Web UI 与 HTTP API 默认端口。' },
  { port: 25565, service: 'MINECRAFT', name: 'Minecraft Java 服务器', category: 'media', transports: ['TCP'], security: 'plain', summary: 'Minecraft Java Edition 多人服务器的常见默认端口。' },
  { port: 27017, service: 'MONGODB', name: 'MongoDB', category: 'database', transports: ['TCP'], security: 'optional', summary: 'MongoDB 数据库服务的默认客户端连接端口。' },
]
