const escape = (v: string) => v.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
/** An installation's same-origin task pane; no tenant, authority or credential in XML. */
export function officeManifest(origin: string, host: 'PowerPoint' | 'Word') {
 const url = new URL(origin), presentation = host === 'PowerPoint'
 if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Office requires a trusted HTTPS installation')
 return `<?xml version="1.0" encoding="UTF-8"?>
<OfficeApp xmlns="http://schemas.microsoft.com/office/appforoffice/1.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="TaskPaneApp">
<Id>${presentation ? 'a96c2674-f754-4a92-b7b2-214162c2d70a' : '4d1a5675-a01c-4a71-8bb6-cf04766063e1'}</Id><Version>1.0.0.0</Version><ProviderName>Easel</ProviderName><DefaultLocale>en-US</DefaultLocale><DisplayName DefaultValue="Easel reports"/><Description DefaultValue="Insert and refresh your permitted Easel report tables, charts and numbers."/><IconUrl DefaultValue="${escape(url.origin)}/apple-touch-icon.png"/><SupportUrl DefaultValue="${escape(url.origin)}/run"/>
<AppDomains><AppDomain>${escape(url.origin)}</AppDomain></AppDomains><Hosts><Host Name="${presentation ? 'Presentation' : 'Document'}"/></Hosts><Requirements><Sets DefaultMinVersion="${presentation ? '1.8' : '1.3'}"><Set Name="${presentation ? 'PowerPointApi' : 'WordApi'}"/></Sets></Requirements><DefaultSettings><SourceLocation DefaultValue="${escape(url.origin)}/app?tab=reports&amp;office=1"/></DefaultSettings><Permissions>ReadWriteDocument</Permissions>
</OfficeApp>`
}
