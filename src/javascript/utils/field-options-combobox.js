(function() {
    var Ext = window.Ext4 || window.Ext;

    Ext.define('Rally.ui.combobox.FieldOptionsCombobox', {
        requires: [],
        extend: 'Rally.ui.combobox.FieldComboBox',
        alias: 'widget.tsfieldoptionscombobox',

        _isNotHidden: function(field) {
            //We want dropdown fields, iteration, release, state?
            var allowedFields = ['Iteration','Release'];

            if (field  && Ext.Array.contains(allowedFields, field.name)){
                return true;
            }

            if (field && field.attributeDefinition &&
                field.attributeDefinition.AttributeType === 'STRING'){
                return true;
            }
            return false;
        },
        _populateStore: function() {
            if (!this.store) {
                return;
            }
            var data = _.sortBy(
                _.map(
                    _.filter(this.model.getFields(), this._isNotHidden),
                    this._convertFieldToLabelValuePair,
                    this
                ),
                'name'
            );

            if (this.allowNoEntry){
                data.unshift({name: this.noEntryText, value: null});
            }
            this.store.loadRawData(data);
            this.setDefaultValue();
            this.onReady();
        }
    });
})();