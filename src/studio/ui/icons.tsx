import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function BaseIcon({ size = 14, children, ...props }: IconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.6}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			style={{ flexShrink: 0 }}
			{...props}
		>
			{children}
		</svg>
	)
}

export function IconSparkles(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path d="M8 2v3M8 11v3M2 8h3M11 8h3M4.2 4.2l2.1 2.1M9.7 9.7l2.1 2.1M11.8 4.2L9.7 6.3M6.3 9.7l-2.1 2.1" />
		</BaseIcon>
	)
}

export function IconRefresh(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path d="M13.5 8a5.5 5.5 0 1 1-1.4-3.7" />
			<path d="M13.5 2.5v2.3h-2.3" />
		</BaseIcon>
	)
}

export function IconEye(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path d="M1.5 8s2.4-4.2 6.5-4.2S14.5 8 14.5 8s-2.4 4.2-6.5 4.2S1.5 8 1.5 8Z" />
			<circle cx="8" cy="8" r="1.8" />
		</BaseIcon>
	)
}

export function IconImage(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<rect x="2" y="2.5" width="12" height="11" rx="1.5" />
			<circle cx="5.5" cy="6" r="1.2" />
			<path d="m3 12 3.5-3.5 2.5 2.5 2-2 2 3" />
		</BaseIcon>
	)
}

export function IconText(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path d="M3 4h10M8 4v8M5.5 12h5" />
		</BaseIcon>
	)
}

export function IconCamera(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h1.3l1-1.5h4.4l1 1.5h1.3A1.5 1.5 0 0 1 14 5.5v6.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12V5.5Z" />
			<circle cx="8" cy="8.8" r="2.3" />
		</BaseIcon>
	)
}

export function IconGrid(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<rect x="2" y="2" width="12" height="12" rx="1.2" />
			<path d="M2 7.2h12M8.8 2l-1.6 12" />
		</BaseIcon>
	)
}

export function IconSliders(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
			<circle cx="5.5" cy="4.5" r="1.4" fill="var(--tl-color-panel, #fff)" />
			<circle cx="10.5" cy="8" r="1.4" fill="var(--tl-color-panel, #fff)" />
			<circle cx="7" cy="11.5" r="1.4" fill="var(--tl-color-panel, #fff)" />
		</BaseIcon>
	)
}

export function IconBook(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path d="M2 3.5A1.5 1.5 0 0 1 3.5 2H8v11.5H3.5A1.5 1.5 0 0 0 2 15V3.5Z" />
			<path d="M14 3.5A1.5 1.5 0 0 0 12.5 2H8v11.5h4.5A1.5 1.5 0 0 1 14 15V3.5Z" />
		</BaseIcon>
	)
}

export function IconDownload(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path d="M8 2.5v7.5M5 7.5l3 3 3-3M2.5 13h11" />
		</BaseIcon>
	)
}

export function IconLayers(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path d="m8 2 6 3.2L8 8.4 2 5.2 8 2Z" />
			<path d="m2 8 6 3.2L14 8" />
			<path d="m2 10.8 6 3.2 6-3.2" />
		</BaseIcon>
	)
}

export function IconLock(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<rect x="3.5" y="7.5" width="9" height="6.5" rx="1.2" />
			<path d="M5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5" />
		</BaseIcon>
	)
}

export function IconUnlock(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<rect x="3.5" y="7.5" width="9" height="6.5" rx="1.2" />
			<path d="M5.5 7.5V5a2.5 2.5 0 0 1 4.8-.8" />
		</BaseIcon>
	)
}

export function IconUpload(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path d="M8 10.5V3M5 5.5 8 2.5l3 3M2.5 13h11" />
		</BaseIcon>
	)
}

export function IconSend(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path d="m14 2-6.5 6.5M14 2l-4.2 12-2.3-5.5L2 6.2 14 2Z" />
		</BaseIcon>
	)
}

export function IconSun(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<circle cx="8" cy="8" r="2.8" />
			<path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2" />
		</BaseIcon>
	)
}

export function IconMoon(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path d="M13.2 9.8A5.2 5.2 0 0 1 6.2 2.8a5.2 5.2 0 1 0 7 7Z" />
		</BaseIcon>
	)
}

export function IconCompare(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path d="M8 2v12M2.5 4h5.5v8H2.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM8 4h5.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8" />
		</BaseIcon>
	)
}

export function IconCrosshair(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<circle cx="8" cy="8" r="5.5" />
			<path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3" />
		</BaseIcon>
	)
}

export function IconPlus(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path d="M8 3v10M3 8h10" />
		</BaseIcon>
	)
}

export function IconPlay(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<polygon points="4.5,3 13,8 4.5,13" fill="currentColor" stroke="none" />
		</BaseIcon>
	)
}

export function IconClose(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path d="m4 4 8 8M12 4l-8 8" />
		</BaseIcon>
	)
}

export function IconUser(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<circle cx="8" cy="5.5" r="2.5" />
			<path d="M3 13.5c0-2.5 2.2-4 5-4s5 1.5 5 4" />
		</BaseIcon>
	)
}

export function IconVolumeOff(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path d="M7.5 3.5 4.5 6H2v4h2.5l3 2.5v-9ZM11 6l3 4M14 6l-3 4" />
		</BaseIcon>
	)
}

export const IconFileText = IconText

export function IconFrame(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<rect x="2.2" y="2.2" width="11.6" height="11.6" rx="1.4" />
			<path d="M5 2.2v11.6M11 2.2v11.6M2.2 5h11.6M2.2 11h11.6" />
		</BaseIcon>
	)
}

export function IconTerminal(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<rect x="2" y="2.5" width="12" height="11" rx="1.5" />
			<path d="m4.5 6 2.5 2-2.5 2M8 10h3.5" />
		</BaseIcon>
	)
}

export function IconBubble(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path d="M2.5 4A1.5 1.5 0 0 1 4 2.5h8A1.5 1.5 0 0 1 13.5 4v6A1.5 1.5 0 0 1 12 11.5H6.8L3.8 14v-2.5H4A1.5 1.5 0 0 1 2.5 10V4Z" />
		</BaseIcon>
	)
}

export function IconCheck(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path d="m3 8.5 3.2 3.2L13 4.8" />
		</BaseIcon>
	)
}

export function IconCompass(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<circle cx="8" cy="8" r="6" />
			<polygon points="6.5,6.5 11,5 9.5,9.5 5,11" />
		</BaseIcon>
	)
}

export function IconSettings(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<circle cx="8" cy="8" r="2.2" />
			<path d="M8 2v1.6M8 12.4V14M2 8h1.6M12.4 8H14M3.8 3.8l1.1 1.1M11.1 11.1l1.1 1.1M12.2 3.8l-1.1 1.1M4.9 11.1 3.8 12.2" />
		</BaseIcon>
	)
}

export function IconWand(props: IconProps) {
	return (
		<BaseIcon {...props}>
			<path d="m2.5 13.5 8-8M11.5 2.5l2 2-1.5 1.5-2-2 1.5-1.5ZM8 2v2M14 8h-2M12.5 3.5l1-1" />
		</BaseIcon>
	)
}
