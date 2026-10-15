const path = require('node:path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')

module.exports = (_, argv) => {
    const production = argv.mode === 'production'
    const style = loader => [production ? MiniCssExtractPlugin.loader : 'style-loader', 'css-loader', loader].filter(Boolean)
    return {
        mode: production ? 'production' : 'development',
        entry: './client/src/mobile/index.tsx',
        output: {
            path: path.resolve(__dirname, '../mobile/dist'), publicPath: '/',
            filename: 'assets/[name].[contenthash:8].js', chunkFilename: 'assets/[name].[contenthash:8].js', clean: true,
        },
        module: { rules: [
            { test: /\.(jsx?|tsx?)$/, include: path.resolve(__dirname, '../client/src'), use: {
                loader: 'babel-loader', options: { cacheDirectory: true },
            } },
            { test: /\.css$/, use: style() },
            { test: /\.less$/, use: style('less-loader') },
            { test: /\.svg$/, use: ['@svgr/webpack'] },
            { test: /\.(png|jpe?g|woff2?|ttf)$/, type: 'asset/resource' },
        ] },
        resolve: { alias: { '@': path.resolve(__dirname, '../client/src') }, extensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs'] },
        plugins: [new HtmlWebpackPlugin({ template: path.resolve(__dirname, '../mobile/index.html') }),
            ...(production ? [new MiniCssExtractPlugin({ filename: 'assets/[name].[contenthash:8].css' })] : [])],
        optimization: { splitChunks: { chunks: 'all' } },
        devtool: production ? false : 'cheap-module-source-map',
        devServer: { host: '127.0.0.1', port: 8797, open: false, hot: true, historyApiFallback: true },
        performance: { maxEntrypointSize: 3_500_000, maxAssetSize: 3_500_000 },
    }
}
