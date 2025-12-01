# Bielik MVP - Frontend
FROM nginx:alpine

# Metadata
LABEL maintainer="Softreck"
LABEL description="Bielik MVP Frontend - Static HTML/CSS/JS"

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy static files
COPY index.html /usr/share/nginx/html/
COPY css /usr/share/nginx/html/css/
COPY js /usr/share/nginx/html/js/

# Create error page
RUN echo '<!DOCTYPE html><html><head><title>Error</title></head><body><h1>Serwis niedostępny</h1><p>Spróbuj ponownie za chwilę.</p></body></html>' > /usr/share/nginx/html/50x.html

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost/ || exit 1

# Run nginx
CMD ["nginx", "-g", "daemon off;"]
