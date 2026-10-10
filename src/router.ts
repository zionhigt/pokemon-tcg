export function navigate(path: string): void {
  location.hash = `#/${path}`;
}

export function currentRoute(): { page: string; param?: string } {
  const [page = '', param] = location.hash.replace(/^#\/?/, '').split('/');
  return { page: page || 'boutique', param };
}
