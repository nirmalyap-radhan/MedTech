import React from 'react';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
}

export const MediKiokLogo: React.FC<IconProps> = ({ size = 36, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    {/* Soft rounded medical cross with organic leaf curve */}
    <rect width="48" height="48" rx="14" fill="#144E44" />
    <path
      d="M24 10V38M10 24H38"
      stroke="#4ADE80"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Overlaid subtle white cross center for contrast */}
    <path
      d="M24 13V35M13 24H35"
      stroke="#FFFFFF"
      strokeWidth="3.5"
      strokeLinecap="round"
    />
    {/* Organic leaf accent */}
    <path
      d="M24 24C28 17 35 15 35 15C35 15 36 22 30 27C27 29.5 24 28 24 24Z"
      fill="#86EFAC"
      fillOpacity="0.9"
    />
  </svg>
);

export const FeverIcon: React.FC<IconProps> = ({ size = 28, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#E05252"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M14 4a2 2 0 0 0-4 0v10.5a4 4 0 1 0 4 0V4z" />
    <path d="M12 9v5" stroke="#E05252" strokeWidth="2" />
    <circle cx="12" cy="17" r="2" fill="#E05252" />
    <path d="M17 6h2M17 10h3M17 14h2" stroke="#E05252" strokeWidth="1.5" />
  </svg>
);

export const CoughIcon: React.FC<IconProps> = ({ size = 28, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#2563EB"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Trachea */}
    <path d="M12 3v7" />
    {/* Bronchi branches */}
    <path d="M12 7l-3 4" />
    <path d="M12 7l3 4" />
    {/* Left Lung */}
    <path d="M9 11c-2.5 0-5 2-5 5.5 0 3 2 4.5 4 4.5 1.5 0 2.5-.5 3-2l-.5-8" />
    {/* Right Lung */}
    <path d="M15 11c2.5 0 5 2 5 5.5 0 3-2 4.5-4 4.5-1.5 0-2.5-.5-3-2l.5-8" />
  </svg>
);

export const HeadacheIcon: React.FC<IconProps> = ({ size = 28, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#D97706"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Head profile */}
    <path d="M7 21v-3a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v3" />
    <path d="M9 14V9a5 5 0 1 1 10 0v2l2 2-1 2h-3" />
    {/* Headache radiating waves */}
    <path d="M13 3l1 2M17 4l.5 2M9 4.5l1 1.5" stroke="#D97706" strokeWidth="1.5" />
    <circle cx="14" cy="9" r="1.5" fill="#D97706" />
  </svg>
);

export const StomachPainIcon: React.FC<IconProps> = ({ size = 28, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#059669"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Anatomical stomach shape */}
    <path d="M12 3v4c0 1.5-1 3-3 4-2 1-3 3-3 5.5 0 3 2.5 5 6 5s6.5-2 7-5.5c.5-4-1.5-7.5-4-8.5-1-.5-2-1.5-2-3V3" />
    <path d="M10 13c1 1 3 1 4 0" stroke="#059669" strokeWidth="1.5" />
  </svg>
);

export const BodyPainIcon: React.FC<IconProps> = ({ size = 28, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#7C3AED"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Joint / Bone / Skeletal Pain symbol */}
    <circle cx="7" cy="7" r="2.5" />
    <circle cx="17" cy="7" r="2.5" />
    <circle cx="7" cy="17" r="2.5" />
    <circle cx="17" cy="17" r="2.5" />
    <path d="M9 7.5h6M7.5 9v6M16.5 9v6M9 16.5h6" />
    <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" stroke="#7C3AED" strokeWidth="1.5" />
  </svg>
);

export const BreathlessnessIcon: React.FC<IconProps> = ({ size = 28, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#0284C7"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Lungs with airflow breeze lines */}
    <path d="M12 4v6" />
    <path d="M12 7l-2.5 3M12 7l2.5 3" />
    <path d="M9.5 10c-2 0-4 1.5-4 4.5 0 2.5 1.5 4 3.5 4 1.5 0 2.2-.8 2.5-2l-.5-6.5" />
    <path d="M14.5 10c2 0 4 1.5 4 4.5 0 2.5-1.5 4-3.5 4-1.5 0-2.2-.8-2.5-2l.5-6.5" />
    <path d="M3 5c2-1 4-1 6 0M3 8c1.5-.7 3-.7 4.5 0" stroke="#0284C7" strokeWidth="1.5" />
  </svg>
);

export const NauseaIcon: React.FC<IconProps> = ({ size = 28, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#E11D48"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Stomach / digestive queasiness wave */}
    <path d="M12 3v3c0 1.2-.8 2.3-2 3-1.8.9-2.5 2.5-2.5 4.5 0 2.5 2 4.5 5 4.5s5.5-1.8 6-4.5c.4-3-1-5.5-3-6.5-.8-.4-1.5-1.2-1.5-2.2V3" />
    <path d="M8.5 14c1-1 2 1 3 0s2 1 3 0" stroke="#E11D48" strokeWidth="1.5" />
    <circle cx="16.5" cy="5.5" r="1" fill="#E11D48" />
    <circle cx="18.5" cy="8.5" r="1.5" fill="#E11D48" />
  </svg>
);

export const DizzinessIcon: React.FC<IconProps> = ({ size = 28, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#475569"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Swirling hypnotic / vestibular equilibrium spiral */}
    <path d="M12 12a1 1 0 1 0 0-2 2 2 0 0 0-2 2c0 2 2 4 4 4a6 6 0 0 0 6-6c0-4-3.5-8-8-8a10 10 0 0 0-10 10c0 6 5 11 11 11" />
  </svg>
);

export const BotanicalLeafWatermark: React.FC<IconProps> = ({ size = 180, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 160 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <path
      d="M20 140C20 140 30 80 80 50C130 20 145 15 145 15C145 15 135 65 95 105C55 145 20 140 20 140Z"
      fill="currentColor"
    />
    <path
      d="M35 125C65 95 100 65 140 20"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      opacity="0.4"
    />
    <path
      d="M70 90C80 85 92 84 102 88M88 72C98 67 110 66 120 70M52 108C62 103 74 102 84 106"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      opacity="0.3"
    />
  </svg>
);
