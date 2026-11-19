import { LAYOUT_ANIMATION_MS } from '@/lib/layoutAnimation';
import { useUIStore } from '@/stores/useUIStore';

<<<<<<< HEAD
/**
 * How long the side columns animate open and closed: the session sidebar, the
 * context zones and the work-status card. Zero when the user turned those
 * animations off (Settings › General › Navigation), and then the layout
 * animation they announce ends at once too.
 */
||||||| bc50ba56aa
/**
 * How long the side columns animate open and closed: the session sidebar,
 * the context zones and the work-status card. Zero when the user turned
 * those animations off (Settings › General › Navigation), and then the
 * layout animation they announce ends at once too.
 */
=======
>>>>>>> upstream/main
export const useLayoutAnimationMs = (): number => {
  const enabled = useUIStore((state) => state.layoutAnimations);
  return enabled ? LAYOUT_ANIMATION_MS : 0;
};
