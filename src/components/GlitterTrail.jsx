import React, { useEffect, useRef } from 'react';

const GlitterTrail = ({ theme }) => {
    const canvasRef = useRef(null);
    const particles = useRef([]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationFrameId;
        const colors = theme === 'coquette'
            ? ['#FF8DA1', '#FFC2BA', '#FF9CE9', '#FFFFFF', '#FCE7EF', '#DCAE96']
            : ['#D1D0D0', '#988686', '#FFFFFF', '#5C4E4E'];

        const handleResize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        const createParticle = (x, y) => {
            const isCoquette = theme === 'coquette';
            const size = Math.random() * (isCoquette ? 3.1 : 2.8) + (isCoquette ? 1.6 : 1.2);
            return {
                x,
                y,
                size,
                color: colors[Math.floor(Math.random() * colors.length)],
                vx: (Math.random() - 0.5) * (isCoquette ? 3.4 : 2.6),
                vy: (Math.random() - 0.5) * (isCoquette ? 3.1 : 2.3) - (isCoquette ? 0.9 : 0.4),
                gravity: isCoquette ? 0.08 : 0.1,
                opacity: 1,
                shrink: isCoquette ? 0.972 : 0.96,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.2,
                kind: isCoquette && Math.random() > 0.4 ? 'star' : 'diamond'
            };
        };

        const handleMouseMove = (e) => {
            const spawnCount = theme === 'coquette' ? 5 : 4;

            for (let i = 0; i < spawnCount; i++) {
                particles.current.push(createParticle(e.clientX, e.clientY));
            }
        };

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            for (let i = 0; i < particles.current.length; i++) {
                const p = particles.current[i];
                
                p.x += p.vx;
                p.y += p.vy;
                p.vy += p.gravity;
                p.opacity *= p.shrink;
                p.size *= (p.shrink + (Math.random() * 0.04 - 0.02));
                p.rotation += p.rotationSpeed;

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                ctx.globalAlpha = p.opacity;
                ctx.fillStyle = p.color;

                ctx.beginPath();
                if (p.kind === 'star') {
                    ctx.moveTo(0, -p.size * 1.25);
                    ctx.lineTo(p.size * 0.34, -p.size * 0.34);
                    ctx.lineTo(p.size * 1.25, 0);
                    ctx.lineTo(p.size * 0.34, p.size * 0.34);
                    ctx.lineTo(0, p.size * 1.25);
                    ctx.lineTo(-p.size * 0.34, p.size * 0.34);
                    ctx.lineTo(-p.size * 1.25, 0);
                    ctx.lineTo(-p.size * 0.34, -p.size * 0.34);
                } else {
                    ctx.moveTo(0, -p.size);
                    ctx.lineTo(p.size / 2, 0);
                    ctx.lineTo(0, p.size);
                    ctx.lineTo(-p.size / 2, 0);
                }
                ctx.closePath();
                ctx.fill();

                if (theme === 'coquette') {
                    ctx.globalAlpha = p.opacity * 0.22;
                    ctx.beginPath();
                    ctx.arc(0, 0, p.size * 1.7, 0, Math.PI * 2);
                    ctx.fill();
                }
                
                ctx.restore();

                if (p.opacity < 0.05 || p.size < 0.5) {
                    particles.current.splice(i, 1);
                    i--;
                }
            }

            animationFrameId = requestAnimationFrame(animate);
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('mousemove', handleMouseMove);
        handleResize();
        animate();

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleMouseMove);
            cancelAnimationFrame(animationFrameId);
        };
    }, [theme]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                pointerEvents: 'none',
                zIndex: 9999,
                opacity: theme === 'coquette' ? 0.9 : 0.6
            }}
        />
    );
};

export default GlitterTrail;
