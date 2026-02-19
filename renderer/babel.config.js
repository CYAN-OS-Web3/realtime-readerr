module.exports = {
  presets: [
    ["@babel/preset-env", {
      "targets": {
        "esmodules": true
      },
      "useBuiltIns": "usage",
      "corejs": 3
    }],
    ["@babel/preset-react", {
      "runtime": "automatic"
    }]
  ],
  plugins: [
    ["@babel/plugin-transform-runtime", {
      "regenerator": true
    }]
  ]
}
