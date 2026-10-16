import { theme, ThemeConfig } from 'antd'

export const appFont = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'

/** Shared controls for the writing workspace, including portalled dialogs. */
export function createAppTheme(dark: boolean): ThemeConfig {
    return {
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
            colorPrimary: dark ? '#8daaff' : '#3763cc',
            colorInfo: dark ? '#8daaff' : '#3763cc',
            colorSuccess: dark ? '#80c5a3' : '#287453',
            colorWarning: dark ? '#e0b671' : '#986b20',
            colorError: dark ? '#ee918b' : '#bf4942',
            colorBgBase: dark ? '#1b1e24' : '#ffffff',
            colorBgContainer: dark ? '#1e2229' : '#ffffff',
            colorBgElevated: dark ? '#252a33' : '#ffffff',
            colorText: dark ? '#e8ecf2' : '#242a35',
            colorTextSecondary: dark ? '#aab3c2' : '#647084',
            colorTextTertiary: dark ? '#919cad' : '#737f90',
            colorBorder: dark ? '#3c4451' : '#d8dee8',
            colorSplit: dark ? '#303640' : '#e8ebf1',
            colorBgLayout: dark ? '#171a20' : '#f7f8fa',
            borderRadius: 7,
            borderRadiusLG: 12,
            controlHeight: 38,
            controlHeightSM: 30,
            controlHeightLG: 44,
            fontFamily: appFont,
            fontSize: 14,
            fontSizeHeading1: 28,
            fontSizeHeading2: 22,
            fontSizeHeading3: 18,
            fontSizeHeading4: 16,
            lineHeight: 1.6,
            boxShadow: '0 8px 28px rgba(20, 30, 50, 0.10)',
            boxShadowSecondary: '0 4px 18px rgba(20, 30, 50, 0.08)',
            motionDurationFast: '0.1s',
            motionDurationMid: '0.16s',
            motionDurationSlow: '0.2s',
        },
        components: {
            Button: { primaryColor: dark ? '#171a20' : '#ffffff', primaryShadow: 'none', defaultShadow: 'none', dangerShadow: 'none', fontWeight: 500, paddingInline: 14 },
            Input: { paddingInline: 12, activeShadow: '0 0 0 3px rgba(55, 99, 204, 0.10)' },
            Select: { optionSelectedFontWeight: 500 },
            Menu: {
                itemBg: 'transparent', subMenuItemBg: 'transparent',
                itemColor: dark ? '#b9c1ce' : '#566174',
                itemSelectedColor: dark ? '#b3c7ff' : '#315bbb',
                itemSelectedBg: dark ? '#29344c' : '#eaf0fc',
                itemHoverBg: dark ? '#232830' : '#edf0f5',
                itemHeight: 38, itemBorderRadius: 7, itemMarginBlock: 2,
                iconSize: 17, groupTitleFontSize: 11, activeBarWidth: 0,
            },
            Tabs: { titleFontSize: 14, horizontalItemGutter: 24 },
            Table: { headerBg: dark ? '#232830' : '#f7f8fa', headerColor: dark ? '#b9c1ce' : '#647084', cellPaddingBlock: 14 },
            Modal: { titleFontSize: 18 },
            Card: { headerFontSize: 16, headerHeight: 48 },
            Tag: { defaultBg: dark ? '#292f39' : '#f2f4f8' },
        },
    }
}
