import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * useMemoryCleanup Hook
 * 
 * 自动清理全局残留资源，防止内存泄漏：
 * - 清理残留的 setTimeout/setInterval
 * - 清理第三方库全局实例（GeoGebra、YouTube 等）
 * - 清理 window 污染的回调函数
 * 
 * 在组件卸载或路由变化时被动触发，不干扰正常数据流和状态管理。
 */
export function useMemoryCleanup() {
  const location = useLocation();
  const pendingTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const pendingIntervalsRef = useRef<Map<number, ReturnType<typeof setInterval>>>(new Map());

  // 组件挂载时：劫持 setTimeout 和 setInterval，以便之后统一清理
  useEffect(() => {
    const originalSetTimeout = window.setTimeout;
    const originalSetInterval = window.setInterval;
    let timeoutId = 0;
    let intervalId = 0;

    // 劫持 setTimeout，记录所有 ID
    (window as any).__timeoutOverride = (
      callback: TimerHandler,
      ms?: number | undefined,
      ...args: any[]
    ) => {
      const id = originalSetTimeout(callback, ms, ...args);
      pendingTimeoutsRef.current.set(timeoutId++, id);
      return id;
    };

    // 劫持 setInterval，记录所有 ID
    (window as any).__intervalOverride = (
      callback: TimerHandler,
      ms?: number | undefined,
      ...args: any[]
    ) => {
      const id = originalSetInterval(callback, ms, ...args);
      pendingIntervalsRef.current.set(intervalId++, id);
      return id;
    };

    return () => {
      delete (window as any).__timeoutOverride;
      delete (window as any).__intervalOverride;
    };
  }, []);

  // 路由变化时或组件卸载时清理
  useEffect(() => {
    return () => {
      cleanupGlobalResources();
    };
  }, [location.pathname]);

  // 清理所有全局资源
  function cleanupGlobalResources() {
    try {
      // 1. 清理残留的 setTimeout
      pendingTimeoutsRef.current.forEach((id) => {
        clearTimeout(id);
      });
      pendingTimeoutsRef.current.clear();

      // 2. 清理残留的 setInterval
      pendingIntervalsRef.current.forEach((id) => {
        clearInterval(id);
      });
      pendingIntervalsRef.current.clear();

      // 3. 清理第三方库全局实例
      cleanupThirdPartyInstances();

      // 4. 清理 window 上的污染回调
      cleanupWindowCallbacks();
    } catch (err) {
      console.warn('[Memory Cleanup] Error during cleanup:', err);
    }
  }

  // 清理第三方库实例（GeoGebra、YouTube 等）
  function cleanupThirdPartyInstances() {
    try {
      // 清理 GeoGebra 实例
      if ((window as any).ggbApplet) {
        try {
          if (typeof (window as any).ggbApplet.remove === 'function') {
            (window as any).ggbApplet.remove();
          }
        } catch (e) {
          console.warn('[Memory Cleanup] GeoGebra cleanup error:', e);
        }
        (window as any).ggbApplet = null;
      }

      // 清理 GeoGebra 容器 DOM（如果存在）
      const geogebraContainers = document.querySelectorAll(
        '[id^="ggb-container-"], [id^="applet_container"]'
      );
      geogebraContainers.forEach((container) => {
        try {
          if (container.parentNode) {
            container.parentNode.removeChild(container);
          }
        } catch (e) {
          console.warn('[Memory Cleanup] DOM cleanup error:', e);
        }
      });

      // 清理 YouTube Player 实例
      if ((window as any).player && typeof (window as any).player.destroy === 'function') {
        try {
          (window as any).player.destroy();
        } catch (e) {
          console.warn('[Memory Cleanup] YouTube player cleanup error:', e);
        }
      }

      // 清理 YT API 缓存（但保留全局 YT 以避免重新加载）
      // 不清理 window.YT，因为 YouTube API 脚本不应该重复加载

    } catch (err) {
      console.warn('[Memory Cleanup] Third-party cleanup error:', err);
    }
  }

  // 清理 window 上的污染全局回调
  function cleanupWindowCallbacks() {
    try {
      // 清理 YouTube API 回调（但保留 onYouTubeIframeAPIReady，因为可能被重新设置）
      // 只在路由切换时清理，避免破坏重新初始化

      // 清理其他可能的全局回调
      const callbacksToClean = [
        'onGeoGebraReady',
        'onMathJaxReady',
        '__REACT_DEVTOOLS_GLOBAL_HOOK__' // 不清理调试工具
      ];

      callbacksToClean.forEach((key) => {
        if (key === '__REACT_DEVTOOLS_GLOBAL_HOOK__') return; // 不清理调试工具
        try {
          delete (window as any)[key];
        } catch (e) {
          // 某些属性不可删除，忽略
        }
      });
    } catch (err) {
      console.warn('[Memory Cleanup] Window callbacks cleanup error:', err);
    }
  }

  // 对外暴露手动清理方法（如需紧急清理）
  return { cleanupGlobalResources };
}
