import React, { useEffect, useRef } from 'react';

const NetworkCanvas = ({ theme }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (theme !== 'black') return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationFrameId;

        // Configuration
        const particles = [];
        const numParticles = 80;
        const connectionDistance = 140;
        const interactionRadius = 200;

        let mouse = { x: -1000, y: -1000 };

        const handleMouseMove = (e) => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
        };
        const handleMouseLeave = () => {
            mouse.x = -1000;
            mouse.y = -1000;
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseout', handleMouseLeave);

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        window.addEventListener('resize', resize);
        resize();

        class Particle {
            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.vx = (Math.random() - 0.5) * 0.8;
                this.vy = (Math.random() - 0.5) * 0.8;
                this.baseSize = Math.random() * 2 + 1;
                this.size = this.baseSize;
            }

            update() {
                this.x += this.vx;
                this.y += this.vy;

                // Bounce off edges
                if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
                if (this.y < 0 || this.y > canvas.height) this.vy *= -1;

                // Interaction with mouse
                const dx = mouse.x - this.x;
                const dy = mouse.y - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < interactionRadius) {
                    // Push particles slightly away
                    const forceDirectionX = dx / distance;
                    const forceDirectionY = dy / distance;
                    const force = (interactionRadius - distance) / interactionRadius;
                    
                    this.x -= forceDirectionX * force * 2;
                    this.y -= forceDirectionY * force * 2;
                    this.size = this.baseSize * 1.5;
                } else {
                    this.size = this.baseSize;
                }
            }

            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(56, 189, 248, 0.4)'; // Cyan nodes
                ctx.fill();
            }
        }

        // Initialize particles
        for (let i = 0; i < numParticles; i++) {
            particles.push(new Particle());
        }

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Update & draw particles
            for (let i = 0; i < particles.length; i++) {
                particles[i].update();
                particles[i].draw();

                // Draw connections
                for (let j = i; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < connectionDistance) {
                        ctx.beginPath();
                        ctx.strokeStyle = `rgba(129, 140, 248, ${1 - distance / connectionDistance})`; // Purple-ish lines
                        ctx.lineWidth = 1;
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }
            animationFrameId = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseout', handleMouseLeave);
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationFrameId);
        };
    }, [theme]);

    if (theme !== 'black') return null;

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                pointerEvents: 'none',
                zIndex: -1,
                background: 'linear-gradient(135deg, #09090b 0%, #0f172a 100%)' // Dark slate base
            }}
        />
    );
};

export default NetworkCanvas;
