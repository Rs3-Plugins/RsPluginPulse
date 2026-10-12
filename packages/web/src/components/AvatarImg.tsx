import { useState } from "react";

interface Props {
  src: string | null;
  fallbackText: string;
  imgClassName?: string;
  fallbackClassName?: string;
}

// Renders the image, but drops back to an initials label if the url 404s
// (e.g. a guessed GitHub avatar for a username that turns out not to
// exist) instead of leaving a broken-image icon on screen.
export function AvatarImg({ src, fallbackText, imgClassName, fallbackClassName }: Props) {
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return <img src={src} alt="" referrerPolicy="no-referrer" className={imgClassName} onError={() => setFailed(true)} />;
  }
  return <span className={fallbackClassName}>{fallbackText}</span>;
}
