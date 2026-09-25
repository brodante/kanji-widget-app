// @ts-nocheck
/**
 * AIFab — draggable floating action button that opens the AI Sensei bottom sheet.
 *
 * Implements Apple Design principles (.cursor/SKILL.md):
 * - Apple §1: Response on pointer-down (scale shrinks immediately on touch).
 * - Apple §2: Direct manipulation (1:1 tracking with finger during drag).
 * - Apple §4: Behavior over animation (fluid springs, critically damped settle).
 * - Apple §5: Velocity handoff (release velocity fed into spring).
 * - Apple §6: Momentum projection (projects landing spot based on flick velocity).
 * - Apple §7: Anchoring & edge snapping (docks cleanly to left or right margin).
 * - Persistent position saved to AsyncStorage across app sessions.
 */

import BottomSheet from '@gorhom/bottom-sheet';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AISenseiModal from './AISenseiModal';
import { useTheme } from '../theme/ThemeContext';
import { getFabPosition, saveFabPosition } from '../storage/StorageManager';

const FAB_SIZE = 56;
const EDGE_MARGIN = 16;
const DRAG_THRESHOLD = 5;

export default function AIFab() {
  const { colors } = useTheme();
  const sheetRef   = useRef<BottomSheet>(null);

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const tabBarHeight = Platform.OS === 'ios' ? 88 : 64;

  const minX = insets.left + EDGE_MARGIN;
  const maxX = Math.max(minX, screenWidth - insets.right - FAB_SIZE - EDGE_MARGIN);
  const minY = insets.top + EDGE_MARGIN;
  const maxY = Math.max(minY, screenHeight - insets.bottom - tabBarHeight - FAB_SIZE - 12);

  const defaultX = maxX;
  const defaultY = maxY - 16;

  const currentPos = useRef({ x: defaultX, y: defaultY });
  const pan = useRef(new Animated.ValueXY({ x: defaultX, y: defaultY })).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const isDraggingRef = useRef(false);

  // Keep fresh bounds for the PanResponder callbacks
  const boundsRef = useRef({ minX, maxX, minY, maxY, screenWidth });
  boundsRef.current = { minX, maxX, minY, maxY, screenWidth };

  // Load saved position on mount
  useEffect(() => {
    let isMounted = true;
    getFabPosition().then(saved => {
      if (!isMounted) return;
      if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
        const clampedX = Math.min(Math.max(saved.x, minX), maxX);
        const clampedY = Math.min(Math.max(saved.y, minY), maxY);
        const targetX = clampedX + FAB_SIZE / 2 < screenWidth / 2 ? minX : maxX;
        currentPos.current = { x: targetX, y: clampedY };
        pan.setValue({ x: targetX, y: clampedY });
      } else {
        currentPos.current = { x: defaultX, y: defaultY };
        pan.setValue({ x: defaultX, y: defaultY });
      }
    });
    return () => {
      isMounted = false;
    };
  }, [screenWidth, screenHeight, minX, maxX, minY, maxY, defaultX, defaultY]);

  // Keep in bounds on screen dimension/orientation change
  useEffect(() => {
    const clampedX = currentPos.current.x + FAB_SIZE / 2 < screenWidth / 2 ? minX : maxX;
    const clampedY = Math.min(Math.max(currentPos.current.y, minY), maxY);
    if (Math.abs(currentPos.current.x - clampedX) > 1 || Math.abs(currentPos.current.y - clampedY) > 1) {
      currentPos.current = { x: clampedX, y: clampedY };
      Animated.spring(pan, {
        toValue: { x: clampedX, y: clampedY },
        damping: 18,
        stiffness: 240,
        useNativeDriver: true,
      }).start();
    }
  }, [screenWidth, screenHeight, minX, maxX, minY, maxY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.hypot(gestureState.dx, gestureState.dy) > DRAG_THRESHOLD;
      },
      onPanResponderGrant: () => {
        isDraggingRef.current = false;
        pan.setOffset({ x: currentPos.current.x, y: currentPos.current.y });
        pan.setValue({ x: 0, y: 0 });

        // Immediate tactile response on touch-down (Apple §1)
        Animated.timing(scaleAnim, {
          toValue: 0.92,
          duration: 70,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderMove: (_, gestureState) => {
        if (Math.hypot(gestureState.dx, gestureState.dy) > DRAG_THRESHOLD) {
          isDraggingRef.current = true;
        }
        pan.setValue({ x: gestureState.dx, y: gestureState.dy });
      },
      onPanResponderRelease: (_, gestureState) => {
        pan.flattenOffset();
        const dist = Math.hypot(gestureState.dx, gestureState.dy);
        const { minX: bMinX, maxX: bMaxX, minY: bMinY, maxY: bMaxY, screenWidth: bWidth } = boundsRef.current;

        // If tap gesture without drag movement, open sheet
        if (dist <= DRAG_THRESHOLD && !isDraggingRef.current) {
          Animated.spring(scaleAnim, {
            toValue: 1,
            damping: 14,
            stiffness: 280,
            useNativeDriver: true,
          }).start();
          sheetRef.current?.expand();
          return;
        }

        // Drag release — project momentum and snap to edge (Apple §4, §5, §6)
        const releasedX = currentPos.current.x + gestureState.dx;
        const releasedY = currentPos.current.y + gestureState.dy;

        // Velocity-guided edge selection or nearest horizontal edge
        let targetX: number;
        if (gestureState.vx > 0.4) {
          targetX = bMaxX;
        } else if (gestureState.vx < -0.4) {
          targetX = bMinX;
        } else {
          const centerX = releasedX + FAB_SIZE / 2;
          targetX = centerX < bWidth / 2 ? bMinX : bMaxX;
        }

        // Vertical momentum projection clamped within safe viewport
        const projectedY = releasedY + gestureState.vy * 60;
        const targetY = Math.min(Math.max(projectedY, bMinY), bMaxY);

        currentPos.current = { x: targetX, y: targetY };

        Animated.parallel([
          Animated.spring(scaleAnim, {
            toValue: 1,
            damping: 14,
            stiffness: 300,
            useNativeDriver: true,
          }),
          Animated.spring(pan, {
            toValue: { x: targetX, y: targetY },
            damping: 18,
            stiffness: 220,
            velocity: { x: gestureState.vx, y: gestureState.vy },
            useNativeDriver: true,
          }),
        ]).start(() => {
          saveFabPosition({ x: targetX, y: targetY });
        });
      },
      onPanResponderTerminate: () => {
        pan.flattenOffset();
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 14,
          stiffness: 300,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  return (
    <>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.fabContainer,
          {
            transform: [
              { translateX: pan.x },
              { translateY: pan.y },
              { scale: scaleAnim },
            ],
          },
        ]}
        accessibilityLabel="Open AI Sensei"
        accessibilityRole="button"
      >
        <Animated.View
          style={[
            styles.fab,
            { backgroundColor: colors.primary },
          ]}
        >
          <Text style={styles.fabIcon}>師</Text>
        </Animated.View>
      </Animated.View>

      {/* Bottom sheet — rendered at root level */}
      <AISenseiModal sheetRef={sheetRef} />
    </>
  );
}

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 50,
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
    elevation: 8,
  },
  fabIcon: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
