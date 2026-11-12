package admin

import "strings"

// Unknown upstream errors retain their original diagnostic text.
func localizeAdminError(language, message string) string {
	primary := strings.ToLower(strings.TrimSpace(strings.Split(language, ",")[0]))
	if primary != "en" && !strings.HasPrefix(primary, "en-") {
		return message
	}
	if translated, ok := adminEnglishErrors[message]; ok {
		return translated
	}
	for _, pair := range [][2]string{{"查询账号失败: ", "Unable to query accounts: "}, {"请求体解析失败: ", "Unable to parse request body: "}, {"模型名称无效: ", "Invalid model name: "}, {"保存失败: ", "Unable to save: "}, {"读取响应缓存设置失败：", "Unable to read response-cache settings: "}} {
		if strings.HasPrefix(message, pair[0]) {
			return pair[1] + strings.TrimPrefix(message, pair[0])
		}
	}
	return message
}

var adminEnglishErrors = map[string]string{
	"请求格式错误": "Invalid request format", "无效的账号 ID": "Invalid account ID", "账号不存在": "Account not found", "代理URL无效": "Invalid proxy URL",
	"无效 ID": "Invalid ID", "请求体无效": "Invalid request body", "名称长度不能超过100字符": "Name must not exceed 100 characters", "图片不存在": "Image not found",
	"名称包含非法字符": "Name contains invalid characters", "任务不存在": "Task not found", "缺少或无效的 API Key": "Missing or invalid API key", "Prompt 审核配置不可用": "Prompt review configuration is unavailable",
	"账号不在运行时池中": "Account is not in the runtime pool", "数据库不可用": "Database unavailable", "无效的 API Key ID": "Invalid API key ID", "API Key 不存在": "API key not found",
	"服务未就绪": "Service not ready", "请求格式无效": "Invalid request format", "平台绑定不存在": "Platform binding not found", "候选证据 ID 无效": "Invalid candidate evidence ID",
	"代理 URL 无效": "Invalid proxy URL", "API Key 是必填字段": "API key is required", "账号没有可用的 access token，请先刷新账号": "Account has no usable access token; refresh it first",
	"ids 与 selector 不能同时提供": "Provide either ids or selector, not both", "start/end 参数格式错误，需要 RFC3339 格式": "start/end must use RFC3339 format", "代理不存在": "Proxy not found",
	"图片文件不存在": "Image file not found", "ModelTrace 指纹库加载失败": "Unable to load the ModelTrace fingerprint database", "ids 参数无效": "Invalid ids parameter",
	"账号凭据已被其他操作更新，请重试": "Account credentials changed in another operation; try again", "请先设置管理密钥，再启用远程迁移": "Set an admin key before enabling remote migration", "生成 session_id 失败": "Unable to generate a session ID",
	"缺少 Authorization Bearer API Key": "Missing Authorization Bearer API key", "API Key 无效或不存在": "API key is invalid or does not exist", "API Key 已停用": "API key is disabled",
}
