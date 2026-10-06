export default class Utils {
  formatNumber = (value: any) => {
  if (!value) return "";
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
formatNumberToVND = (value: any) => {
  if (!value) return "0 VND";
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + ' VND';
};
}