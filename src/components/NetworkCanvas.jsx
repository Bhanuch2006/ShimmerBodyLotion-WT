import React, { useEffect, useRef } from 'react';

const NetworkCanvas = ({ theme }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (theme !== 'black') return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationFrameId;

        let mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

        const handleMouseMove = (e) => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
        };
        window.addEventListener('mousemove', handleMouseMove);

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        window.addEventListener('resize', resize);
        resize();

        class Star {
            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 1.5;
                this.depth = Math.random() * 3 + 1; // 1 to 4
                this.baseX = this.x;
                this.baseY = this.y;
                this.twinkle = Math.random();
                this.twinkleSpeed = (Math.random() - 0.5) * 0.05;
                this.color = Math.random() > 0.8 ? '#00e5ff' : Math.random() > 0.8 ? '#b026ff' : '#ffffff';
            }

            update(mx, my) {
                // Parallax shift based on mouse relative to center
                const dx = (mx - canvas.width / 2) * (this.depth * 0.05);
                const dy = (my - canvas.height / 2) * (this.depth * 0.05);
                
                // Slow drift
                this.baseY -= this.depth * 0.1;
                if (this.baseY < -10) this.baseY = canvas.height + 10;
                
                this.x = this.baseX - dx;
                this.y = this.baseY - dy;

                this.twinkle += this.twinkleSpeed;
                if (this.twinkle > 1 || this.twinkle < 0.2) this.twinkleSpeed *= -1;
            }

            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.globalAlpha = this.twinkle;
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        }

        const stars = [];
        for (let i = 0; i < 200; i++) {
            stars.push(new Star());
        }

        let time = 0;

        const animate = () => {
            // Dark cosmic background
            ctx.fillStyle = '#05030a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Time tick for nebulas
            time += 0.005;

            // Draw Nebula Clouds
            const cx = canvas.width / 2;
            const cy = canvas.height / 2;

            // Nebula 1 (Cyan)
            const n1x = cx + Math.cos(time) * 200;
            const n1y = cy + Math.sin(time * 0.8) * 150;
            const grd1 = ctx.createRadialGradient(n1x, n1y, 0, n1x, n1y, 800);
            grd1.addColorStop(0, 'rgba(0, 229, 255, 0.08)');
            grd1.addColorStop(1, 'rgba(0, 229, 255, 0)');
            ctx.fillStyle = grd1;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Nebula 2 (Purple)
            const n2x = cx + Math.sin(time * 1.2) * 250;
            const n2y = cy + Math.cos(time * 0.9) * 200;
            const grd2 = ctx.createRadialGradient(n2x, n2y, 0, n2x, n2y, 800);
            grd2.addColorStop(0, 'rgba(176, 38, 255, 0.08)');
            grd2.addColorStop(1, 'rgba(176, 38, 255, 0)');
            ctx.fillStyle = grd2;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Update & draw stars
            for (let i = 0; i < stars.length; i++) {
                stars[i].update(mouse.x, mouse.y);
                stars[i].draw();
            }

            animationFrameId = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
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
                zIndex: -1
            }}
        />
    );
};

export default NetworkCanvas;
