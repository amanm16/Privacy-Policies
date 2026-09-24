import { copyText } from '../lib/clipboard';
import { useToast } from '../toast';

export default function CopyLinkButton({ url, label = 'Copy link', className = 'button' }) {
  const toast = useToast();
  async function copy(event) {
    event.stopPropagation();
    const copied = await copyText(url);
    toast(copied ? 'Link copied: ' + url : "Couldn't copy. The link is " + url, copied ? 'success' : 'danger');
  }
  return (
    <button type="button" className={className} onClick={copy} title={url}>
      {label}
    </button>
  );
}
