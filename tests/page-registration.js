function isPageRegistered(app, route) {
  return (app.pages || []).includes(route)
    || (app.subPackages || []).some(pkg => (pkg.pages || [])
      .some(page => `${pkg.root}/${page}` === route));
}

module.exports = { isPageRegistered };
