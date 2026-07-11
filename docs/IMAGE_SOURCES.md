# Image Sources and Manifest

Direct external image downloading was blocked in this Codex environment by HTTP 403 responses, and the built-in image generation tool is unavailable in this session. Therefore no fake or blank image files were created.

The application has been wired to use the following local image paths. Add licensed HD WebP files at these exact paths before deployment:

| Local filename | Required dimensions | Source website | Original page URL | Creator | License / usage basis | Used in |
|---|---:|---|---|---|---|---|
| `public/images/home/enterprise-rack-servers.webp` | 1600px+ wide | To be supplied | To be supplied | To be supplied | Commercial-use permitted / owned / generated | Homepage hero |
| `public/images/categories/core-network-router-switch.webp` | 1000px+ wide | To be supplied | To be supplied | To be supplied | Commercial-use permitted / owned / generated | Networking showcase and category page |
| `public/images/categories/medical-patient-monitor.webp` | 1000px+ wide | To be supplied | To be supplied | To be supplied | Commercial-use permitted / owned / generated | Medical showcase and category page |
| `public/images/categories/plc-industrial-automation.webp` | 1000px+ wide | To be supplied | To be supplied | To be supplied | Commercial-use permitted / owned / generated | Industrial/Others showcase and category page |
| `public/images/products/industrial-ups-inverter.webp` | 1000px+ wide | To be supplied | To be supplied | To be supplied | Commercial-use permitted / owned / generated | Energy showcase, energy category and product fallback |
| `public/images/products/diagnostic-ultrasound-system.webp` | 1000px+ wide | To be supplied | To be supplied | To be supplied | Commercial-use permitted / owned / generated | Medical product fallback |
| `public/images/products/enterprise-rack-servers.webp` | 1000px+ wide | To be supplied | To be supplied | To be supplied | Commercial-use permitted / owned / generated | Networking product fallback |

Do not deploy until real licensed files are added or the paths will return 404.
