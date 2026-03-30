import React, { useEffect, useRef } from 'react';

const CustomCursor = ({ theme }) => {
    const mainCursorRef = useRef(null);
    const trailCursorRef = useRef(null);

    useEffect(() => {
        if (theme !== 'black') return;

        const mainCursor = mainCursorRef.current;
        const trailCursor = trailCursorRef.current;
        if (!mainCursor || !trailCursor) return;

        let mouseX = window.innerWidth / 2;
        let mouseY = window.innerHeight / 2;
        let trailX = window.innerWidth / 2;
        let trailY = window.innerHeight / 2;
        let isHovering = false;
        let animationFrameId;

        const handleMouseMove = (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        };

        const handleMouseDown = () => {
            mainCursor.style.transform = `translate(-50%, -50%) scale(0.8)`;
            trailCursor.style.transform = `translate(-50%, -50%) scale(1.5)`;
        };

        const handleMouseUp = () => {
            mainCursor.style.transform = `translate(-50%, -50%) scale(1)`;
            trailCursor.style.transform = `translate(-50%, -50%) scale(1)`;
        };

        const handleMouseOver = (e) => {
            const tagName = e.target.tagName.toLowerCase();
            const role = e.target.getAttribute('role');
            if (['a', 'button', 'input', 'select', 'textarea'].includes(tagName) || role === 'button' || e.target.classList.contains('btn') || e.target.classList.contains('sw-icon')) {
                isHovering = true;
            } else {
                isHovering = false;
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('mouseover', handleMouseOver);

        const animate = () => {
            // Main cursor exactly on mouse
            mainCursor.style.left = `${mouseX}px`;
            mainCursor.style.top = `${mouseY}px`;

            // Trail cursor smooth lerp
            trailX += (mouseX - trailX) * 0.15;
            trailY += (mouseY - trailY) * 0.15;
            trailCursor.style.left = `${trailX}px`;
            trailCursor.style.top = `${trailY}px`;

            if (isHovering) {
                mainCursor.style.borderColor = '#b026ff'; // Magenta hover
                trailCursor.style.background = 'rgba(176, 38, 255, 0.4)';
                trailCursor.style.boxShadow = '0 0 30px rgba(176, 38, 255, 0.6)';
            } else {
                mainCursor.style.borderColor = '#00e5ff'; // Cyan default
                trailCursor.style.background = 'rgba(0, 229, 255, 0.2)';
                trailCursor.style.boxShadow = '0 0 20px rgba(0, 229, 255, 0.4)';
            }

            animationFrameId = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('mouseover', handleMouseOver);
            cancelAnimationFrame(animationFrameId);
        };
    }, [theme]);

    if (theme !== 'black') return null;

    return (
        <>
            <div 
                ref={trailCursorRef} 
                style={{
                    position: 'fixed',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    pointerEvents: 'none',
                    zIndex: 9998,
                    transform: 'translate(-50%, -50%)',
                    transition: 'transform 0.1s ease, background 0.3s ease, box-shadow 0.3s ease'
                }} 
            />
            <div 
                ref={mainCursorRef} 
                className="custom-main-cursor"
                style={{
                    position: 'fixed',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    border: '2px solid #00e5ff',
                    pointerEvents: 'none',
                    zIndex: 9999,
                    transform: 'translate(-50%, -50%)',
                    transition: 'transform 0.1s ease, border-color 0.3s ease'
                }} 
            >
                {/* Crosshair Inner Dot */}
                <div style={{
                    position: 'absolute',
                    top: '50%', left: '50%',
                    width: '4px', height: '4px',
                    background: '#ffffff',
                    borderRadius: '50%',
                    transform: 'translate(-50%, -50%)'
                }}></div>
            </div>
        </>
    );
};

export default CustomCursor;
