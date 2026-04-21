export interface CsdnSettings {
	enabled: boolean;
	home: string;
	apiUrl: string;
	cookie: string;
	publishFlagField: string;
	postIdField: string;
	previewUrl: string;
	defaultTags: string;
	defaultCategories: string;
	useFrontMatterTags: boolean;
	useFrontMatterCategories: boolean;
}

export interface PublisherPluginSettings {
	debug: boolean;
	csdn: CsdnSettings;
}

export const DEFAULT_CSDN_SETTINGS: CsdnSettings = {
	enabled: false,
	home: "https://blog.csdn.net",
	apiUrl: "https://bizapi.csdn.net",
	cookie: "",
	publishFlagField: "csdnPublish",
	postIdField: "csdnPostId",
	previewUrl: "/[userid]/article/details/[postid]",
	defaultTags: "",
	defaultCategories: "",
	useFrontMatterTags: true,
	useFrontMatterCategories: true,
};

export const DEFAULT_SETTINGS: PublisherPluginSettings = {
	debug: false,
	csdn: DEFAULT_CSDN_SETTINGS,
};

export function mergePublisherSettings(data: Partial<PublisherPluginSettings> | undefined): PublisherPluginSettings {
	const source = data ?? {};

	return {
		debug: source.debug ?? DEFAULT_SETTINGS.debug,
		csdn: {
			...DEFAULT_CSDN_SETTINGS,
			...(source.csdn ?? {}),
		},
	};
}
