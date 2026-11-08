const React = require('react');
const { View } = require('react-native');

const MockMapView = React.forwardRef((props, ref) => {
  return React.createElement(View, { ref, ...props }, props.children);
});
MockMapView.displayName = 'MockMapView';

const MockMarker = React.forwardRef((props, ref) => {
  return React.createElement(View, { ref, ...props }, props.children);
});
MockMarker.displayName = 'MockMarker';

const MockCallout = React.forwardRef((props, ref) => {
  return React.createElement(View, { ref, ...props }, props.children);
});
MockCallout.displayName = 'MockCallout';

module.exports = {
  __esModule: true,
  default: MockMapView,
  MapView: MockMapView,
  Marker: MockMarker,
  Callout: MockCallout,
};
