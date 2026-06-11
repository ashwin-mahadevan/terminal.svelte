import type { IDisposable } from '$lib/common/Lifecycle';
import type { ILinkProvider } from '$lib/browser/services/Services';

export class LinkProviderService {
	public readonly linkProviders: ILinkProvider[] = [];

	public dispose(): void {
		this.linkProviders.length = 0;
	}

	public registerLinkProvider(linkProvider: ILinkProvider): IDisposable {
		this.linkProviders.push(linkProvider);
		return {
			dispose: () => {
				// Remove the link provider from the list
				const providerIndex = this.linkProviders.indexOf(linkProvider);

				if (providerIndex !== -1) {
					this.linkProviders.splice(providerIndex, 1);
				}
			}
		};
	}
}
