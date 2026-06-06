import type { ILinkProvider, ILinkProviderService } from '$lib/browser/services/Services';
import type { IDisposable } from '$lib/common/Types';

export class LinkProviderService implements ILinkProviderService {
	declare public serviceBrand: undefined;

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
