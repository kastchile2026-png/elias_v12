/** @type {import('next').NextConfig} */
const nextConfig = {
	typescript: {
		ignoreBuildErrors: true,
	},
	turbopack: {
		resolveAlias: {
			// Alinea con webpack: evita resolver 'canvas' en el cliente usando un shim
			canvas: require.resolve('./shims/canvas.js'),
		},
	},
	webpack: (config, { isServer }) => {
		// Evita que Webpack resuelva 'canvas' (Node-only). pdfjs-dist incluye una rama Node que lo requiere,
		// pero en el navegador usamos la build ESM (pdf.mjs) que no lo necesita.
		config.resolve = config.resolve || {}
		config.resolve.alias = {
			...(config.resolve.alias || {}),
			canvas: false,
		}
		config.resolve.fallback = {
			...(config.resolve.fallback || {}),
			canvas: false,
		}
		return config
	},
	experimental: {
		serverActions: {
			allowedOrigins: [
				'localhost:3000',
				'localhost:9002',
				'*.github.dev',
				'*.gitpod.io',
				'*.repl.co',
				'*.app.github.dev',
			],
			bodySizeLimit: '50mb', // Aumentado de 2mb a 50mb para carga masiva
		},
	},
	images: {
		remotePatterns: [
			{
				protocol: 'https',
				hostname: 'placehold.co',
				port: '',
				pathname: '/**',
			},
		],
	},
	transpilePackages: ['genkit', 'dotprompt'],
}

module.exports = nextConfig

