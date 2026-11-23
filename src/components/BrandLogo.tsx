import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'w-9 h-9 p-0.5 rounded-lg',
  md: 'w-11 h-11 p-1 rounded-xl',
  lg: 'w-16 h-16 p-1.5 rounded-2xl',
} as const;

export function BrandLogo({ size = 'sm', className = '' }: BrandLogoProps) {
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return (
      <div
        className={`${SIZE_CLASSES[size]} bg-teal-700 text-white flex items-center justify-center shrink-0 ${className}`}
        aria-label="Logo Gestão de Coletores"
      >
        <ShieldCheck className={size === 'lg' ? 'w-8 h-8' : 'w-5 h-5'} />
      </div>
    );
  }

  return (
    <div
      className={`${SIZE_CLASSES[size]} bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 ${className}`}
    >
      <img
        src="/assets/aistudio/logo_pequena_0741d19a.jfif"
        alt="Logo Gestão de Coletores"
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className="w-full h-full object-contain"
      />
    </div>
  );
}
