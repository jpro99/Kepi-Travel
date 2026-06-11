export const triggerHaptic = (pattern: 'light' | 'medium' | 'heavy' | 'success' | 'error') => {
    if (typeof window !== 'undefined' && window.navigator.vibrate) {
        switch (pattern) {
            case 'light':
                window.navigator.vibrate(50);
                break;
            case 'medium':
                window.navigator.vibrate(100);
                break;
            case 'heavy':
                window.navigator.vibrate(200);
                break;
            case 'success':
                window.navigator.vibrate([100, 50, 100]);
                break;
            case 'error':
                window.navigator.vibrate([200, 50, 200]);
                break;
            default:
                break;
        }
    }
};