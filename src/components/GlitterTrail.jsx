import React, { useEffect, useRef } from 'react';

const GlitterTrail = ({ theme }) => {
    const canvasRef = useRef(null);
    const particles = useRef([]);
    
    // Update colors to include Coquette pastels, crisp whites, and gold
    const colors = ['#FF8DA1', '#FFC2BA', '#FF9CE9', '#AD56C4', '#FFFFFF', '#DCAE96'];

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationFrameId;

        const handleResize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        const createParticle = (x, y) => {
            const size = Math.random() * 3 + 1.5; // Slightly smaller, delicate chunks
            return {
                x,
                y,
                size,
                color: colors[Math.floor(Math.random() * colors.length)],
                vx: (Math.random() - 0.5) * 2.5, // Softer horizontal spread
                vy: (Math.random() - 0.5) * 2.5 - 0.5, // Gentle upward bump before dropping
                gravity: 0.1, // Softer drop speed
                opacity: 1,
                shrink: 0.96, // Fade out normally
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.2
            };
        };

        const handleMouseMove = (e) => {
            // Spawn a conservative amount of particles for a subtle, elegant drop
            for (let i = 0; i < 4; i++) {
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
                p.size *= (p.shrink + (Math.random() * 0.04 - 0.02)); // Twinkle effect
                p.rotation += p.rotationSpeed;

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                ctx.globalAlpha = p.opacity;
                ctx.fillStyle = p.color;
                
                // Draw a small diamond/sparkle shape
                ctx.beginPath();
                ctx.moveTo(0, -p.size);
                ctx.lineTo(p.size / 2, 0);
                ctx.lineTo(0, p.size);
                ctx.lineTo(-p.size / 2, 0);
                ctx.closePath();
                ctx.fill();
                
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
                opacity: theme === 'coquette' ? 1 : 0.6 // Fuller effect in coquette
            }}
        />
    );
};

export default GlitterTrail;
