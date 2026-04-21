export const CSDN_X_CA_KEY = "203803574";
export const CSDN_X_CA_KEY_MEDIA = "260196572";
export const CSDN_APP_SECRET = "9znpamsyl2c7cdrr9sas0le9vbc3r6ba";
export const CSDN_APP_SECRET_MEDIA = "t5PaqxVQpWoHgLGt7XPIvd5ipJcwJTU7";

export interface CsdnEndpoints {
	userInfo: string;
	columnList: string;
	saveArticle: string;
	getArticle: string;
	deleteArticle: string;
	imageSign: string;
}

export const CSDN_DEFAULT_API_URL = "https://bizapi.csdn.net";

export function buildCsdnEndpoints(apiUrl: string): CsdnEndpoints {
	const normalizedApiUrl = apiUrl.replace(/\/+$/, "");

	return {
		userInfo: `${normalizedApiUrl}/blog-console-api/v1/user/info`,
		columnList: `${normalizedApiUrl}/blog/phoenix/console/v1/column/list?type=all`,
		saveArticle: `${normalizedApiUrl}/blog-console-api/v3/mdeditor/saveArticle`,
		getArticle: `${normalizedApiUrl}/blog-console-api/v3/editor/getArticle`,
		deleteArticle: `${normalizedApiUrl}/blog/phoenix/console/v1/article/del`,
		imageSign: `${normalizedApiUrl}/resource-api/v1/image/direct/upload/signature`,
	};
};
