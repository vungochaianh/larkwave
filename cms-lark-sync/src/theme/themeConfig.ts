import { ThemeConfig, theme as themeAntd } from "antd";

export const lightTheme: ThemeConfig = {
  token: {
    fontSize: 13,
    colorPrimary: "#DD3333",
    borderRadius: 10,
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgLayout: '#f5f5f5',
    colorBorder: '#e8e8e8',
    colorBorderSecondary: '#f0f0f0',
    colorText: '#1a1a1a',
    colorTextSecondary: '#595959',
    colorTextTertiary: '#8c8c8c',
    motionDurationFast: '0.15s',
    motionDurationMid: '0.25s',
    motionDurationSlow: '0.35s',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
    boxShadowSecondary: '0 4px 12px rgba(0, 0, 0, 0.08)',
  },
  components: {
    Card: {
      paddingLG: 20,
    },
    Menu: {
      itemBorderRadius: 6,
      subMenuItemBorderRadius: 6,
      itemMarginInline: 4,
    },
    Button: {
      controlHeight: 34,
    },
    Table: {
      headerBg: '#fafafa',
      rowHoverBg: '#f5f5f5',
    },
  },
};

export const darkTheme: ThemeConfig = {
  algorithm: themeAntd.darkAlgorithm,
  token: {
    fontSize: 13,
    colorPrimary: "#ef4444",
    borderRadius: 10,
    colorBgContainer: '#161b22',
    colorBgElevated: '#21262d',
    colorBgLayout: '#0f1117',
    colorBorder: '#30363d',
    colorBorderSecondary: '#21262d',
    colorText: '#e6edf3',
    colorTextSecondary: '#8b949e',
    colorTextTertiary: '#6e7681',
    motionDurationFast: '0.15s',
    motionDurationMid: '0.25s',
    motionDurationSlow: '0.35s',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
    boxShadowSecondary: '0 4px 12px rgba(0, 0, 0, 0.3)',
  },
  components: {
    Card: {
      paddingLG: 20,
    },
    Menu: {
      itemBorderRadius: 6,
      subMenuItemBorderRadius: 6,
      itemMarginInline: 4,
    },
    Button: {
      controlHeight: 34,
    },
    Table: {
      headerBg: '#161b22',
      rowHoverBg: '#1c2128',
    },
  },
};

export default lightTheme;
