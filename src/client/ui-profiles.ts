import { DeviceTier } from '../shared/api';

export type UIProfile = {
  atmosphere: {
    attractorRadiusRatio: number;
    helixRadiusRatio: number;
    repelRadiusRatio: number;
  };
  dock: {
    activeIconArcEndDeg: number;
    activeIconArcRadius: number;
    activeIconArcStartDeg: number;
    activeIconCircleRadii: [number, number, number];
    cardDetailWidth: number;
    cardHeight: number;
    cardWidth: number;
    cardTitleOffsetX: number;
    cardTitleOffsetY: number;
    cardDetailOffsetX: number;
    cardDetailOffsetY: number;
    iconCenterY: number;
    iconInactiveArcRadius: number;
    iconInactiveCircleRadii: [number, number, number];
    iconTriangleBottomY: number;
    iconTriangleTopY: number;
    iconTriangleLeftX: number;
    iconTriangleRightX: number;
    panelYFromBottom: number;
    railHeight: number;
    railInsetBottom: number;
    railInsetInner: number;
    spacing: number;
    toolRejectedFillAlpha: number;
    toolSelectedBorderWidth: number;
    toolSelectedFillAlpha: number;
    toolSelectedStrokeWidth: number;
  };
  frame: {
    innerCornerRadius: number;
    outerInset: number;
    outerCornerRadius: number;
    innerInset: number;
  };
  layout: {
    leftMargin: number;
    rightMetricsWidth: number;
    scoreY: number;
    timerY: number;
    quotaY: number;
    subtitleY: number;
    statusY: number;
    titleY: number;
  };
  dockRail: {
    backgroundAlpha: number;
    backgroundInset: number;
    innerBackgroundHeight: number;
    innerBorderCornerRadius: number;
    innerBorderInset: number;
    innerBorderWidthInset: number;
    strokeAlpha: number;
    innerStrokeAlpha: number;
  };
  fonts: {
    titleSize: string;
    subtitleSize: string;
    statusSize: string;
    scoreSize: string;
    timerSize: string;
    quotaSize: string;
    dockTitleSize: string;
    dockDetailSize: string;
    archiveButtonSize: string;
  };
  simulation: {
    particleCount: number;
  };
};

const desktopProfile: UIProfile = {
  atmosphere: {
    attractorRadiusRatio: 0.22,
    helixRadiusRatio: 0.2,
    repelRadiusRatio: 0.18,
  },
  dock: {
    activeIconArcEndDeg: 330,
    activeIconArcRadius: 25,
    activeIconArcStartDeg: 30,
    activeIconCircleRadii: [18, 28, 38],
    cardDetailWidth: 148,
    cardHeight: 118,
    cardWidth: 168,
    cardTitleOffsetX: -72,
    cardTitleOffsetY: -36,
    cardDetailOffsetX: -72,
    cardDetailOffsetY: -4,
    iconCenterY: -8,
    iconInactiveArcRadius: 21,
    iconInactiveCircleRadii: [16, 26, 36],
    iconTriangleBottomY: 16,
    iconTriangleTopY: -20,
    iconTriangleLeftX: -22,
    iconTriangleRightX: 22,
    panelYFromBottom: 104,
    railHeight: 108,
    railInsetBottom: 132,
    railInsetInner: 122,
    spacing: 200,
    toolRejectedFillAlpha: 0.22,
    toolSelectedBorderWidth: 3,
    toolSelectedFillAlpha: 0.1,
    toolSelectedStrokeWidth: 3,
  },
  frame: {
    innerCornerRadius: 18,
    outerInset: 18,
    outerCornerRadius: 24,
    innerInset: 28,
  },
  layout: {
    leftMargin: 32,
    rightMetricsWidth: 240,
    scoreY: 28,
    timerY: 58,
    quotaY: 88,
    subtitleY: 72,
    statusY: 106,
    titleY: 26,
  },
  dockRail: {
    backgroundAlpha: 0.88,
    backgroundInset: 24,
    innerBackgroundHeight: 88,
    innerBorderCornerRadius: 18,
    innerBorderInset: 34,
    innerBorderWidthInset: 68,
    strokeAlpha: 0.5,
    innerStrokeAlpha: 0.18,
  },
  fonts: {
    titleSize: '40px',
    subtitleSize: '16px',
    statusSize: '18px',
    scoreSize: '22px',
    timerSize: '18px',
    quotaSize: '18px',
    dockTitleSize: '18px',
    dockDetailSize: '12px',
    archiveButtonSize: '14px',
  },
  simulation: {
    particleCount: 180,
  },
};

const scaleFactor = 0.75;

const scaleDimensions = (profile: UIProfile, factor: number): UIProfile => {
  const scale = (v: number) => Math.round(v * factor);
  return {
    ...profile,
    dock: {
      ...profile.dock,
      activeIconArcRadius: scale(profile.dock.activeIconArcRadius),
      activeIconCircleRadii: profile.dock.activeIconCircleRadii.map(scale) as [number, number, number],
      cardDetailWidth: scale(profile.dock.cardDetailWidth),
      cardHeight: scale(profile.dock.cardHeight),
      cardWidth: scale(profile.dock.cardWidth),
      cardTitleOffsetX: scale(profile.dock.cardTitleOffsetX),
      cardTitleOffsetY: scale(profile.dock.cardTitleOffsetY),
      cardDetailOffsetX: scale(profile.dock.cardDetailOffsetX),
      cardDetailOffsetY: scale(profile.dock.cardDetailOffsetY),
      iconCenterY: scale(profile.dock.iconCenterY),
      iconInactiveArcRadius: scale(profile.dock.iconInactiveArcRadius),
      iconInactiveCircleRadii: profile.dock.iconInactiveCircleRadii.map(scale) as [number, number, number],
      iconTriangleBottomY: scale(profile.dock.iconTriangleBottomY),
      iconTriangleTopY: scale(profile.dock.iconTriangleTopY),
      iconTriangleLeftX: scale(profile.dock.iconTriangleLeftX),
      iconTriangleRightX: scale(profile.dock.iconTriangleRightX),
      panelYFromBottom: scale(profile.dock.panelYFromBottom),
      railHeight: scale(profile.dock.railHeight),
      railInsetBottom: scale(profile.dock.railInsetBottom),
      railInsetInner: scale(profile.dock.railInsetInner),
      spacing: scale(profile.dock.spacing),
    },
    frame: {
      ...profile.frame,
      innerCornerRadius: scale(profile.frame.innerCornerRadius),
      outerInset: scale(profile.frame.outerInset),
      outerCornerRadius: scale(profile.frame.outerCornerRadius),
      innerInset: scale(profile.frame.innerInset),
    },
    layout: {
      ...profile.layout,
      leftMargin: scale(profile.layout.leftMargin),
      rightMetricsWidth: scale(profile.layout.rightMetricsWidth),
      scoreY: scale(profile.layout.scoreY),
      timerY: scale(profile.layout.timerY),
      quotaY: scale(profile.layout.quotaY),
      subtitleY: scale(profile.layout.subtitleY),
      statusY: scale(profile.layout.statusY),
      titleY: scale(profile.layout.titleY),
    },
    dockRail: {
      ...profile.dockRail,
      backgroundInset: scale(profile.dockRail.backgroundInset),
      innerBackgroundHeight: scale(profile.dockRail.innerBackgroundHeight),
      innerBorderCornerRadius: scale(profile.dockRail.innerBorderCornerRadius),
      innerBorderInset: scale(profile.dockRail.innerBorderInset),
      innerBorderWidthInset: scale(profile.dockRail.innerBorderWidthInset),
    },
    fonts: {
      ...profile.fonts,
      titleSize: `${Math.round(40 * factor)}px`,
      subtitleSize: `${Math.round(16 * factor)}px`,
      statusSize: `${Math.round(18 * factor)}px`,
      scoreSize: `${Math.round(22 * factor)}px`,
      timerSize: `${Math.round(18 * factor)}px`,
      quotaSize: `${Math.round(18 * factor)}px`,
      dockTitleSize: `${Math.round(18 * factor)}px`,
      dockDetailSize: `${Math.round(12 * factor)}px`,
      archiveButtonSize: `${Math.round(14 * factor)}px`,
    },
  };
};

const tabletProfile = {
  ...scaleDimensions(desktopProfile, scaleFactor),
  simulation: { particleCount: 120 },
};

const phoneProfile: UIProfile = {
  atmosphere: {
    attractorRadiusRatio: 0.15,
    helixRadiusRatio: 0.14,
    repelRadiusRatio: 0.12,
  },
  dock: {
    activeIconArcEndDeg: 330,
    activeIconArcRadius: 14,
    activeIconArcStartDeg: 30,
    activeIconCircleRadii: [8, 13, 18],
    cardDetailWidth: 0,
    cardHeight: 44,
    cardWidth: 44,
    cardTitleOffsetX: 0,
    cardTitleOffsetY: 0,
    cardDetailOffsetX: 0,
    cardDetailOffsetY: 0,
    iconCenterY: 0,
    iconInactiveArcRadius: 11,
    iconInactiveCircleRadii: [7, 12, 16],
    iconTriangleBottomY: 8,
    iconTriangleTopY: -10,
    iconTriangleLeftX: -11,
    iconTriangleRightX: 11,
    panelYFromBottom: 60,
    railHeight: 52,
    railInsetBottom: 62,
    railInsetInner: 60,
    spacing: 54,
    toolRejectedFillAlpha: 0.22,
    toolSelectedBorderWidth: 2,
    toolSelectedFillAlpha: 0.1,
    toolSelectedStrokeWidth: 2,
  },
  frame: {
    innerCornerRadius: 0,
    outerInset: 0,
    outerCornerRadius: 0,
    innerInset: 0,
  },
  layout: {
    leftMargin: 8,
    rightMetricsWidth: 0,
    scoreY: 8,
    timerY: 14,
    quotaY: 20,
    subtitleY: 0,
    statusY: 0,
    titleY: 0,
  },
  dockRail: {
    backgroundAlpha: 0.88,
    backgroundInset: 4,
    innerBackgroundHeight: 44,
    innerBorderCornerRadius: 10,
    innerBorderInset: 8,
    innerBorderWidthInset: 12,
    strokeAlpha: 0.5,
    innerStrokeAlpha: 0.18,
  },
  fonts: {
    titleSize: '12px',
    subtitleSize: '10px',
    statusSize: '12px',
    scoreSize: '14px',
    timerSize: '12px',
    quotaSize: '12px',
    dockTitleSize: '9px',
    dockDetailSize: '8px',
    archiveButtonSize: '10px',
  },
  simulation: {
    particleCount: 60,
  },
};

export const PROFILES: Record<DeviceTier, UIProfile> = {
  [DeviceTier.Desktop]: desktopProfile,
  [DeviceTier.Tablet]: tabletProfile,
  [DeviceTier.Phone]: phoneProfile,
};
