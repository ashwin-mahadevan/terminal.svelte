import type { ILinkProvider, ILinkProviderService } from '$lib/browser/services/Services';
import { DisposableStore, toDisposable } from '$lib/common/Lifecycle';
import type { IDisposable } from '$lib/common/Types';

export class LinkProviderService implements ILinkProviderService {
	private readonly _store = new DisposableStore();
	declare public serviceBrand: undefined;

	public readonly linkProviders: ILinkProvider[] = [];

	constructor() {
		this._store.add(toDisposable(() => (this.linkProviders.length = 0)));
	}

	public dispose(): void {
		this._store.dispose();
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
